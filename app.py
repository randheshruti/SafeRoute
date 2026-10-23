from functools import wraps

import mysql.connector
from flask import (Flask, abort, flash, jsonify, redirect, render_template,
                   request, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

from config import DEFAULT_CENTER, DEFAULT_ZOOM, SECRET_KEY
from db import query

app = Flask(__name__)
app.secret_key = SECRET_KEY


@app.context_processor
def inject_config():
    return {"sr": {"center": list(DEFAULT_CENTER), "zoom": DEFAULT_ZOOM}}


@app.errorhandler(mysql.connector.Error)
def db_error(e):
    msg = f"Database error: {e}. Check config.py and make sure schema.sql was run."
    if request.path.startswith("/api/"):
        return jsonify(error=msg), 500
    return msg, 500


def login_required(f):
    @wraps(f)
    def wrapper(*a, **k):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify(error="Please log in first."), 401
            flash("Please log in first.", "error")
            return redirect(url_for("login"))
        return f(*a, **k)
    return wrapper


def admin_required(f):
    @login_required
    @wraps(f)
    def wrapper(*a, **k):
        if not session.get("is_admin"):
            flash("Admins only.", "error")
            return redirect(url_for("dashboard"))
        return f(*a, **k)
    return wrapper


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------- Public / auth ----------
@app.route("/")
def index():
    stats = {"places": 0, "incidents": 0, "users": 0}
    try:
        stats["places"] = query("SELECT COUNT(*) AS c FROM safe_places", one=True)["c"]
        stats["incidents"] = query("SELECT COUNT(*) AS c FROM incidents", one=True)["c"]
        stats["users"] = query("SELECT COUNT(*) AS c FROM users", one=True)["c"]
    except mysql.connector.Error:
        pass  # home page still opens if the database is not ready
    return render_template("index.html", stats=stats)


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        if not name or not email or len(password) < 6:
            flash("Enter name, email and a password of at least 6 characters.", "error")
        elif query("SELECT id FROM users WHERE email=%s", (email,), one=True):
            flash("This email is already registered.", "error")
        else:
            query("INSERT INTO users (name,email,password) VALUES (%s,%s,%s)",
                  (name, email, generate_password_hash(password)), commit=True)
            flash("Account created. Please log in.", "success")
            return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = query("SELECT * FROM users WHERE email=%s", (email,), one=True)
        if user and check_password_hash(user["password"], password):
            session.clear()
            session.update(user_id=user["id"], name=user["name"], is_admin=bool(user["is_admin"]))
            return redirect(url_for("dashboard"))
        flash("Invalid email or password.", "error")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("index"))


# ---------- Main pages ----------
@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html")


@app.route("/report")
@login_required
def report():
    mine = query("SELECT location, description, created_at FROM incidents "
                 "WHERE user_id=%s ORDER BY id DESC LIMIT 10", (session["user_id"],))
    return render_template("report.html", mine=mine)


@app.route("/safety", methods=["GET", "POST"])
@login_required
def safety():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        phone = request.form.get("phone", "").strip()
        rel = request.form.get("relationship", "").strip()
        if name and phone:
            query("INSERT INTO emergency_contacts (user_id,name,phone,relationship) VALUES (%s,%s,%s,%s)",
                  (session["user_id"], name, phone, rel), commit=True)
            flash("Contact added.", "success")
        else:
            flash("Name and phone are required.", "error")
        return redirect(url_for("safety"))
    alerts = query("SELECT title, message, created_at FROM alerts ORDER BY id DESC")
    contacts = query("SELECT * FROM emergency_contacts WHERE user_id=%s", (session["user_id"],))
    return render_template("safety.html", alerts=alerts, contacts=contacts)


@app.route("/contacts/delete/<int:cid>", methods=["POST"])
@login_required
def delete_contact(cid):
    query("DELETE FROM emergency_contacts WHERE id=%s AND user_id=%s",
          (cid, session["user_id"]), commit=True)
    flash("Contact removed.", "success")
    return redirect(url_for("safety"))


@app.route("/feedback", methods=["GET", "POST"])
@login_required
def feedback():
    if request.method == "POST":
        rating = request.form.get("rating", type=int)
        comments = request.form.get("comments", "").strip()
        if rating and 1 <= rating <= 5:
            query("INSERT INTO feedback (user_id,rating,comments) VALUES (%s,%s,%s)",
                  (session["user_id"], rating, comments), commit=True)
            flash("Thank you for your feedback!", "success")
            return redirect(url_for("feedback"))
        flash("Please choose a star rating.", "error")
    return render_template("feedback.html")


# ---------- JSON API used by the interactive map ----------
@app.route("/api/map-data")
@login_required
def map_data():
    return jsonify(
        safe_places=query("SELECT name, category, lat, lng FROM safe_places"),
        incidents=query("SELECT location, description, lat, lng FROM incidents WHERE lat IS NOT NULL"),
        risk_zones=query("SELECT name, description, lat, lng FROM risk_zones"),
    )


@app.route("/api/incident", methods=["POST"])
@login_required
def api_incident():
    d = request.get_json(silent=True) or {}
    location = str(d.get("location", "")).strip()
    description = str(d.get("description", "")).strip()
    if not location or not description:
        return jsonify(error="Location and description are required."), 400
    query("INSERT INTO incidents (user_id,location,description,lat,lng) VALUES (%s,%s,%s,%s,%s)",
          (session["user_id"], location, description, to_float(d.get("lat")), to_float(d.get("lng"))),
          commit=True)
    return jsonify(ok=True, message="Incident reported. Thank you for helping others stay safe.")


@app.route("/api/sos", methods=["POST"])
@login_required
def api_sos():
    d = request.get_json(silent=True) or {}
    lat, lng = to_float(d.get("lat")), to_float(d.get("lng"))
    if lat is None or lng is None:
        return jsonify(error="Your location is required to save an SOS record."), 400
    query("INSERT INTO sos_records (user_id,location,lat,lng,details) VALUES (%s,%s,%s,%s,%s)",
          (session["user_id"], f"{lat:.5f}, {lng:.5f}", lat, lng, str(d.get("details", "")).strip()),
          commit=True)
    contacts = query("SELECT name, phone FROM emergency_contacts WHERE user_id=%s", (session["user_id"],))
    return jsonify(ok=True, contacts=contacts)


# ---------- Admin ----------
@app.route("/admin")
@admin_required
def admin():
    ctx = dict(
        users=query("SELECT id,name,email,is_admin FROM users ORDER BY id"),
        incidents=query("SELECT i.id,u.name,i.location,i.description FROM incidents i JOIN users u ON u.id=i.user_id ORDER BY i.id DESC"),
        sos=query("SELECT s.id,u.name,s.location,s.details FROM sos_records s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC"),
        feedback=query("SELECT f.id,u.name,f.rating,f.comments FROM feedback f JOIN users u ON u.id=f.user_id ORDER BY f.id DESC"),
        places=query("SELECT * FROM safe_places ORDER BY id DESC"),
        zones=query("SELECT * FROM risk_zones ORDER BY id DESC"),
        alerts=query("SELECT * FROM alerts ORDER BY id DESC"),
    )
    return render_template("admin.html", **ctx)


@app.route("/admin/add/<kind>", methods=["POST"])
@admin_required
def admin_add(kind):
    f = request.form
    try:
        if kind == "safe_place":
            query("INSERT INTO safe_places (name,category,lat,lng) VALUES (%s,%s,%s,%s)",
                  (f["name"].strip(), f["category"], float(f["lat"]), float(f["lng"])), commit=True)
        elif kind == "risk_zone":
            query("INSERT INTO risk_zones (name,description,lat,lng) VALUES (%s,%s,%s,%s)",
                  (f["name"].strip(), f.get("description", "").strip(), float(f["lat"]), float(f["lng"])), commit=True)
        elif kind == "alert":
            query("INSERT INTO alerts (title,message) VALUES (%s,%s)",
                  (f["title"].strip(), f["message"].strip()), commit=True)
        else:
            abort(404)
        flash("Added successfully.", "success")
    except (KeyError, ValueError):
        flash("Please fill all fields (click the map to pick a location).", "error")
    return redirect(url_for("admin"))


@app.route("/admin/delete/<table>/<int:rid>", methods=["POST"])
@admin_required
def admin_delete(table, rid):
    if table not in {"incidents", "safe_places", "alerts", "risk_zones", "feedback"}:
        abort(404)
    query(f"DELETE FROM {table} WHERE id=%s", (rid,), commit=True)  # table name is whitelisted above
    flash("Deleted.", "success")
    return redirect(url_for("admin"))


if __name__ == "__main__":
    app.run(debug=True)