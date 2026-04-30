#!/bin/sh
chown -R app:app /data
exec gosu app uvicorn main:app --host 0.0.0.0 --port 8000
