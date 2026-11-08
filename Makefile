.DEFAULT_GOAL := help

.PHONY: help up up-d build down down-v restart ps logs logs-app logs-db shell-app shell-db test reset-db

help:
	@echo ==============================================================================
	@echo                          COOPGESTION - DOCKER COMMANDS
	@echo ==============================================================================
	@echo   make up        - Levanta los servicios con logs en consola (build automatico)
	@echo   make up-d      - Levanta los servicios en segundo plano (detached mode)
	@echo   make build     - Reconstruye la imagen de la aplicacion
	@echo   make down      - Detiene los contenedores y remueve la red
	@echo   make down-v    - Detiene todo y ELIMINA los volumenes (datos de PostgreSQL)
	@echo   make restart   - Reinicia los contenedores de la aplicacion y base de datos
	@echo   make ps        - Muestra el estado de los contenedores
	@echo   make logs      - Muestra los logs en tiempo real de todos los servicios
	@echo   make logs-app  - Muestra los logs del contenedor de la aplicacion (Node.js)
	@echo   make logs-db   - Muestra los logs del contenedor de PostgreSQL
	@echo   make shell-app - Abre una shell interactiva en el contenedor de la app
	@echo   make shell-db  - Abre una consola interactiva psql en PostgreSQL
	@echo   make test      - Ejecuta los tests de validacion dentro del contenedor
	@echo   make reset-db  - Resetea la BD por completo y vuelve a levantar con seeds
	@echo ==============================================================================

up:
	docker compose up --build

up-d:
	docker compose up -d --build

build:
	docker compose build

down:
	docker compose down

down-v:
	docker compose down -v

restart:
	docker compose restart

ps:
	docker compose ps

logs:
	docker compose logs -f

logs-app:
	docker compose logs -f app

logs-db:
	docker compose logs -f db

shell-app:
	docker compose exec app sh

shell-db:
	docker compose exec db psql -U coopgestion -d coopgestion

test:
	docker compose exec app npm run test:monotributo

reset-db:
	docker compose down -v
	docker compose up -d --build
