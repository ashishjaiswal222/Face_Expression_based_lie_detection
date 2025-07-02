# Define paths
$root = "C:\Users\shank\OneDrive\Desktop\lie-detector"
$source = "$root\face-api.js-master"
$destJS = "$root\static\js"
$destModels = "$root\static\models"

# Create destination directories if they don't exist
New-Item -ItemType Directory -Path $destJS -Force
New-Item -ItemType Directory -Path $destModels -Force

# Copy face-api.min.js
Copy-Item "$source\dist\face-api.min.js" -Destination $destJS -Force

# Copy model files to static/models
Copy-Item "$source\weights\*" -Destination $destModels -Recurse -Force
