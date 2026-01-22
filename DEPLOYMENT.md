# Simplicity Unchained Web Demo Deployment

## Deployment Steps

1. Build a Dockerfile of [Simplicity Unchained](https://github.com/BlockstreamResearch/simplicity-unchained/tree/94a897f339a765bd70fbcc649c688febab0b3f3b) (this specific commit should be used). Specify ports in the [configuration](https://github.com/BlockstreamResearch/simplicity-unchained/blob/94a897f339a765bd70fbcc649c688febab0b3f3b/service/config.toml) and the [Dockerfile](https://github.com/BlockstreamResearch/simplicity-unchained/blob/94a897f339a765bd70fbcc649c688febab0b3f3b/Dockerfile#L54) itself. Deploy and expose this service by some URL that can be accessed outside of the cluster by a public IP.

2. Build a Dockerfile of [Simplicity Unchained Web Demo Proxy](https://github.com/distributed-lab/simplicity-unchained-web-proxy/tree/ce15ba3c906336b3da528e62a0895f417fa4fd8a) (this specific commit should be used). Specify ports in the [configuration](https://github.com/distributed-lab/simplicity-unchained-web-proxy/blob/ce15ba3c906336b3da528e62a0895f417fa4fd8a/config.toml) and the [Dockerfile](https://github.com/distributed-lab/simplicity-unchained-web-proxy/blob/ce15ba3c906336b3da528e62a0895f417fa4fd8a/Dockerfile#L38) itself. Deploy and expose this service by some URL that can be accessed outside of the cluster by a public IP.

3. In this project create .env.local based on .env.local.example where NEXT_PUBLIC_SIMPLICITY_SERVICE_URL is a URL of Simplicity Unchained (1) and NEXT_PUBLIC_PROXY_URL is a URL of Simplicity Unchained Web Demo (2) Proxy. Then build a [Dockerfile](./Dockerfile) and deploy it as a frontend app.

An already deployed [instance](https://simplicity-unchained-web-demo.ivanlele.com/) can be viewed at.
