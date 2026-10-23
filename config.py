import os

SECRET_KEY = os.environ.get("SAFEROUTE_SECRET_KEY", "change-this-secret-key-before-deployment")

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": os.environ.get("SAFEROUTE_DB_PASSWORD", "SHRUTIRANDHE22"),  # put your MySQL password here
    "database": "saferoute",
    "port": 3306,
}

# Map starts here if the browser does not give your location (lat, lng, zoom)
DEFAULT_CENTER = (20.5937, 78.9629)
DEFAULT_ZOOM = 5