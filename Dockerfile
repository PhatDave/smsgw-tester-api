FROM ubuntu:22.04

WORKDIR /app

COPY "./main.exe/" "./"

EXPOSE 6555
EXPOSE 6556

ENTRYPOINT "./main.exe"
