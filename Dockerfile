# ============================================================
# STNT — Image Docker du site officiel (statique, servi par nginx)
# Build : docker build -t gtecsarlu/stnt-togo:latest .
# Run   : docker run -p 8080:80 gtecsarlu/stnt-togo:latest
# ============================================================
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="STNT - Site officiel" \
      org.opencontainers.image.description="Syndicat des Travailleurs du Numerique du Togo" \
      org.opencontainers.image.url="https://stnt-togo.org" \
      org.opencontainers.image.source="https://github.com/dgtecsarlu/stnt-togo" \
      org.opencontainers.image.authors="Ing. BODJONA Bataka Pignanti <webmaster@stnt-togo.org>" \
      org.opencontainers.image.vendor="GEOTECH TELECOM & ENERGY COMPANY SARLU"

# Configuration nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Contenu statique du site (les exclusions sont dans .dockerignore)
COPY . /usr/share/nginx/html

# Nettoyage des fichiers non destinés à être servis
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/.dockerignore \
          /usr/share/nginx/html/nginx.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
