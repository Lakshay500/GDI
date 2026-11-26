FROM golang:1.23-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/fabric-gateway-bridge .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/fabric-gateway-bridge /fabric-gateway-bridge
USER nonroot:nonroot
EXPOSE 8081
ENTRYPOINT ["/fabric-gateway-bridge"]
