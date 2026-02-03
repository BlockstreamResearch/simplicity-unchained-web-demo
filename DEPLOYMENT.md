# Simplicity Unchained Web Demo Deployment

## Deployment Steps

1. Build a Dockerfile of [Simplicity Unchained](https://github.com/BlockstreamResearch/simplicity-unchained/tree/316a5956b416fbe0dfe38909f2cbbc41661b3855) (this specific commit should be used). Specify ports in the [configuration](https://github.com/BlockstreamResearch/simplicity-unchained/blob/316a5956b416fbe0dfe38909f2cbbc41661b3855/service/config.toml) and the [Dockerfile](https://github.com/BlockstreamResearch/simplicity-unchained/blob/316a5956b416fbe0dfe38909f2cbbc41661b3855/Dockerfile#L54) itself. Deploy and expose this service by from some domain that can be accessed outside of the cluster.

2. In this project create .env.local based on .env.local.example where NEXT_PUBLIC_SIMPLICITY_SERVICE_URL is a URL of Simplicity Unchained (1). Then build a [Dockerfile](./Dockerfile) and deploy it as a frontend app.

An already deployed [instance](https://simplicity-unchained-web-demo.ivanlele.com/) can be viewed.
