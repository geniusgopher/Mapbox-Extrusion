"use client";
import mapboxgl from "mapbox-gl";
// импортируем стили mapbox-gl чтобы карта отображалась коррекно
import "mapbox-gl/dist/mapbox-gl.css";
import { use, useEffect, useRef, useState } from "react";

import * as turf from "@turf/turf";

/** CompassControl */
import CompassControl from "@mapbox-controls/compass";
import "@mapbox-controls/compass/src/index.css";
/** ZoomControl */
import ZoomControl from "@mapbox-controls/zoom";
import "@mapbox-controls/zoom/src/index.css";

const mapBuildingType = (type: string) => {
  switch (type) {
    case "apartments":
      return "Жилой дом";
    case "commercial":
      return "Коммерческое здание";
    case "industrial":
      return "Промышленное здание";
    case "retail":
      return "Торговый центр";
    case "office":
      return "Офисное здание";
    case "hotel":
      return "Гостиница";
    case "hospital":
      return "Больница";
    case "school":
      return "Школа";
    case "university":
      return "Университет";
    default:
      return "Здание";
  }
};

function MapboxMap() {
  // здесь будет хранится инстанс карты после инициализации
  const [map, setMap] = useState<mapboxgl.Map>();
  const [buildingInfo, setBuildingInfo] = useState<any>();

  // React ref для хранения ссылки на DOM ноду который будет
  // использоваться как обязательный параметр `container`
  // при инициализации карты `mapbox-gl`
  // по-умолчанию будет содержать `null`
  const mapNode = useRef(null);

  useEffect(() => {
    const node = mapNode.current;
    // если объект window не найден,
    // то есть компонент рендерится на сервере
    // или dom node не инициализирована, то ничего не делаем
    if (typeof window === "undefined" || node === null) return;

    // иначе создаем инстанс карты передавая ему ссылку на DOM ноду
    // а также accessToken для mapbox
    const mapboxMap = new mapboxgl.Map({
      container: node,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [76.889709, 43.238949], // координаты центра карты города Алматы
      zoom: 15,
      pitch: 40,
      bearing: 20,
      antialias: true,
    });

    // и сохраняем созданный объект карты в useState
    setMap(mapboxMap);

    // добавляем контролы на карту
    mapboxMap.addControl(new ZoomControl(), "bottom-right");
    // добавляем компас  на карту
    mapboxMap.addControl(new CompassControl({ instant: true }), "bottom-right");

    // добавляем слушатель на событие загрузки карты
    mapboxMap.on("load", () => {
      mapboxMap.addLayer({
        id: "building-extrusion",
        type: "fill-extrusion",
        source: "composite",
        "source-layer": "building",
        paint: {
          "fill-extrusion-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false], // если здание выбрано
            "#3d85c6", // то цвет здания синий
            "#aaa", // иначе серый
          ],
          "fill-extrusion-height": [
            "case",
            ["boolean", ["feature-state", "selected"], false], // если здание выбрано
            ["get", "height"], // то высота здания из свойства height
            0, // иначе 0
          ],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": 0.6,
        },
      });
    });

    mapboxMap.on("click", "building-extrusion", (e) => {
      if (!e.features?.length) {
        return;
      }
      const clickedFeature = e.features[0];

      // Extract the properties of the clicked building
      const buildingInfo = clickedFeature.properties || {};
      setBuildingInfo(buildingInfo);

      // Optionally, display this information in a popup
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<h3>Информация о здании</h3>
            <p>Высота: ${buildingInfo.height} метров</p>
            <p>Тип здания: ${mapBuildingType(buildingInfo.type)}</p>
            <p>Адресс: ${buildingInfo.address || '-'}</p>`
        ) // Customize this as per your data
        .addTo(mapboxMap);

      // Перемещаем камеру к центру здания
      const center = turf.center(clickedFeature);
      mapboxMap.flyTo({
        center: new mapboxgl.LngLat(
          center.geometry.coordinates[0],
          center.geometry.coordinates[1]
        ),
        zoom: 17,
      });

      // Если здание уже было выбрано, то снимаем выделение
      mapboxMap
        .queryRenderedFeatures({ layers: ["building-extrusion"] })
        .forEach((feature) => {
          mapboxMap.setFeatureState(feature, { selected: false });
        });

      mapboxMap.setFeatureState(clickedFeature, {
        selected: true,
      });

      // Берем все здания на карте кроме выбранного
      const adjacentBuildings = mapboxMap
        .queryRenderedFeatures({
          layers: ["building-extrusion"],
          filter: ["!=", "id", clickedFeature.id],
        })
        // фильтруем здания, которые находятся в радиусе 100 метров от выбранного здания
        .filter((feature) => {
          // Проверяем расстояние до соседних зданий
          const distance = turf.distance(
            turf.findPoint(clickedFeature),
            turf.findPoint(feature),
            { units: "meters" }
          );

          return distance <= 100; // 100 метров
        });

      const buildingsToHighlight = [clickedFeature];

      for (const building of adjacentBuildings) {
        for (const buildingToHighlight of buildingsToHighlight) {
          // Если здание уже выделено, то пропускаем его
          if (building === buildingToHighlight) {
            continue;
          }
          // Проверяем пересекаются ли здания
          if (
            turf.booleanIntersects(
              turf.transformScale(building, 1.05), // увеличиваем размер здания на 5% чтобы учесть погрешности
              turf.transformScale(buildingToHighlight, 1.05)
            )
          ) {
            // Если здания пересекаются, то добавляем его в список для выделения
            buildingsToHighlight.push(building);
            break;
          }
        }
      }

      // Добавляем выделение для соседних зданий
      buildingsToHighlight.forEach((feature) => {
        // Устанавливаем состояние selected для здания в true
        mapboxMap.setFeatureState(feature, { selected: true });
      });
    });

    // чтобы избежать утечки памяти удаляем инстанс карты
    // когда компонент будет демонтирован
    return () => {
      mapboxMap.remove();
    };
  }, []);

  return (
    <div className="relative">
      <div ref={mapNode} style={{ width: "100vw", height: "100vh" }} />
    </div>
  );
}

export default MapboxMap;
