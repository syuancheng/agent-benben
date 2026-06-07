.PHONY: install dev lint typecheck build test

install:
	npm install

dev:
	npm run dev

lint:
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build

test: lint typecheck build
