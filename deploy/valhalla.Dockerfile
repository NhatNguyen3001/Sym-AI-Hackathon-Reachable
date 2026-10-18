# Valhalla for the cloud backend (cycle 7): the prebuilt Greater Sydney routing tiles and elevation are baked in,
# so it starts serving in about a minute instead of building for ten. Build from valhalla/custom_files:
#   docker build -f deploy/valhalla.Dockerfile -t reachable-valhalla valhalla/custom_files
# (only the files below are sent to the build; the 900 MB source folder and the raw map stay behind)
FROM ghcr.io/valhalla/valhalla-scripted@sha256:c58f9d72ab8c99453dad83da8f0c3df483a1f577243d54d43d9dd1443de1dac5
COPY valhalla.json default_speeds.json /custom_files/
COPY valhalla_tiles.tar /custom_files/
COPY elevation_data /custom_files/elevation_data
EXPOSE 8002
# Serve the prebuilt tiles directly (the image's own start script would check for and rebuild missing data).
ENTRYPOINT ["valhalla_service", "/custom_files/valhalla.json", "2"]
