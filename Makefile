.PHONY: dev prod

dev:
	docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d

prod:
	@iptables -L DOCKER-USER -n 2>/dev/null | grep -q 'ctorigdstport 8001' || \
		{ echo "ERROR: DOCKER-USER iptables rule for port 8001 is missing. See CLAUDE.md Deployment Notes."; exit 1; }
	@iptables -L DOCKER-USER -n 2>/dev/null | grep -q 'ctorigdstport 8002' || \
		{ echo "ERROR: DOCKER-USER iptables rule for port 8002 is missing. See CLAUDE.md Deployment Notes."; exit 1; }
	docker compose up --build -d
