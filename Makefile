# Convenience shortcuts around docker compose.
# Run `make <target>` from the securepay/ directory.

.PHONY: up down rebuild logs ps test psql clean

up:            ## Build and start the whole stack
	docker compose up --build

down:          ## Stop and remove containers
	docker compose down

rebuild:       ## Rebuild images from scratch (no cache)
	docker compose build --no-cache

logs:          ## Tail logs from all services
	docker compose logs -f

ps:            ## Show running containers
	docker compose ps

test:          ## Run the end-to-end smoke test (stack must be up)
	python3 scripts/smoke_test.py

psql:          ## Open a psql shell inside the postgres container
	docker compose exec postgres psql -U securepay -d securepay

clean:         ## Stop everything AND delete the database volume
	docker compose down -v
