.PHONY: dev prod

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

prod:
	docker compose up --build -d
