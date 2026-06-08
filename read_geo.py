import json
from pathlib import Path


GEOJSON_PATH = Path("districts_26_nag_20170101.geojson")


def flatten_coordinates(value):
    if not isinstance(value, list):
        return
    if len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float)):
        yield value[0], value[1]
        return
    for child in value:
        yield from flatten_coordinates(child)


def geometry_summary(geometry):
    geometry_type = geometry.get("type", "unknown")
    coordinates = geometry.get("coordinates", [])
    points = list(flatten_coordinates(coordinates))

    if not points:
        return {
            "type": geometry_type,
            "point_count": 0,
            "bbox": None,
        }

    lngs = [lng for lng, _ in points]
    lats = [lat for _, lat in points]
    bbox = {
        "min_lng": min(lngs),
        "max_lng": max(lngs),
        "min_lat": min(lats),
        "max_lat": max(lats),
    }
    return {
        "type": geometry_type,
        "point_count": len(points),
        "bbox": bbox,
    }


def print_feature(index, feature):
    properties = feature.get("properties", {})
    geometry = feature.get("geometry", {})
    summary = geometry_summary(geometry)
    bbox = summary["bbox"]

    print(f"[{index}] {properties.get('obns_cyr', 'Unknown')} ({properties.get('obns_lat', 'Unknown')})")
    print(f"  id: {properties.get('id')}")
    print(f"  district number: {properties.get('obns_num')}")
    print(f"  geometry type: {summary['type']}")
    print(f"  coordinate pairs: {summary['point_count']}")
    if bbox:
        print(
            "  bbox: "
            f"lng {bbox['min_lng']:.6f} .. {bbox['max_lng']:.6f}, "
            f"lat {bbox['min_lat']:.6f} .. {bbox['max_lat']:.6f}"
        )
    print()


def main():
    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(f"GeoJSON file not found: {GEOJSON_PATH}")

    with GEOJSON_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    features = payload.get("features", [])
    print(f"File: {GEOJSON_PATH}")
    print(f"Type: {payload.get('type', 'unknown')}")
    print(f"Features: {len(features)}")
    print("-" * 72)

    for index, feature in enumerate(features, start=1):
        print_feature(index, feature)


if __name__ == "__main__":
    main()
