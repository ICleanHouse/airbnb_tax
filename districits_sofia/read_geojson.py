import json

file_path = r"C:\Users\35987\Desktop\airbnb_tax\districits_sofia\sofia_districts_ready.geojson"

with open(file_path, "r", encoding="utf-8") as geojson_file:
    data = json.load(geojson_file)

districts = []
for feature in data["features"]:
    district_name = feature["properties"].get("name")
    districts.append(district_name)

print(sorted(districts))
print(len(districts))