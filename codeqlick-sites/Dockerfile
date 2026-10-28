# The site builder (codeqlick-sites/builder): Node 24 with the web-basica template installed.
FROM node:24-alpine
WORKDIR /app
COPY web-basica/package.json web-basica/package-lock.json web-basica/.npmrc ./web-basica/
RUN cd web-basica && npm ci --no-audit --no-fund
COPY web-basica ./web-basica
COPY builder ./builder
# Builds write dist/, .astro/, .work/ and .drafts/ inside the template, as whatever user compose sets.
RUN mkdir -p web-basica/dist web-basica/.astro web-basica/.work web-basica/.drafts \
  && chmod -R a+rwX web-basica
ENV NODE_ENV=production TEMPLATE_DIR=/app/web-basica PORT=4100
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4100/health > /dev/null || exit 1
CMD ["node", "builder/server.mjs"]
