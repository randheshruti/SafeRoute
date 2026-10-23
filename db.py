import mysql.connector
from config import DB_CONFIG


def get_db_connection():
    """Create and return a MySQL database connection."""
    return mysql.connector.connect(**DB_CONFIG)


def query(sql, params=(), one=False, commit=False):
    """Run one SQL statement. Returns rows (list of dicts), one row, or the new id when commit=True."""
    conn = get_db_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params)
        if commit:
            conn.commit()
            return cur.lastrowid
        return cur.fetchone() if one else cur.fetchall()
    finally:
        conn.close()