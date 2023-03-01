"""
Cleans the ABI JSON files in deployments/*/*.json by removing the "gas" field in the elements of the "abi" field.
"""

import json
import os

print("Cleaning ABI JSON files...")

for root, dirs, files in os.walk("./"):
    for file in files:
        if file.endswith(".json"):
            path = os.path.join(root, file)
            print("Reading file: " + path)
            with open(path, "r") as f:
                data = json.load(f)
            if "abi" in data:
                for i in range(len(data["abi"])):
                    if "gas" in data["abi"][i]:
                        del data["abi"][i]["gas"]
                with open(path, "w") as f:
                    json.dump(data, f, indent=2)
