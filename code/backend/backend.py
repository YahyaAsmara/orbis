"""
Back-end code to connect the front-end portion of the web application to the database.
Written in Python using Flask.

Author: Jason Duong, Yahya Asmara, Abdulrahman Negmeldin
"""

"""
How to connect to DB:
- db_engine = create_engine(DATABASE_URL) #DATABASE_URL is kept that way. It is an environment variable in Render with the DB key
- connection_to_db = db_engine.connect() #Connect to the engine to begin inserting commands into the DB

How to execute commands with the DB:
- connection_to_db.execute(text("INSERT SQL COMMAND")) #Execute SQL commands. NOTE THAT THIS WILL BE CODED IN DETAIL LATER ONCE THE DB IS SET UP

Grab results from the DB:
- db_output = connection_to_db.execute(text("INSERT SQL COMMAND"))
- db_output.fetchall() #Grab the results of an SQL command, if the command was meant to bring something back (ex. SELECT)

How to save changes made to the DB:
- connection_to_db.commit() #Without this line, any command executed against the DB will not save after the session ends

How to clean up the DB after use:
- connection_to_db.close()
"""

"""
Used in the context of Render. Allows this file to connect to the database via a URL and allows it to access a secret key.
"""
import os
import re
from functools import wraps
from typing import Optional

"""
Uses SQLAlchemy to connect to the database
Imports create_engine as the main entry point into the DB
Imports text to safely inject SQL code into the database
"""
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

"""
Import the Flask framework so it can be used.
Import request to handle requests from the front-end.
Import jsonify so communications to the front-end are in the form of JSON.
- JSON is used as this uses the REST standard and JSON is commonly used.
Import session so that flask can manage sessions.
"""
from flask import Flask, request, jsonify, g
from flask_cors import CORS

"""
Import bcrypt to hash passwords.
"""
import bcrypt


"""
Import datetime used for saving registration date of users
"""
from datetime import datetime, timedelta, timezone

"""
Import jwt used for authentication
Define the jwt algorithm used, which is HS256
Define length of tokens in hours
"""
import jwt
jwt_algo = "HS256"
jwt_expire_minutes = 60 * 2  # 2 hour token

"""
Used for A* 
"""
import heapq
from collections import defaultdict

"""
Gets the database URL from Render's environmental variable named DATABASE_URL (configured in the Render website).
Also gets the secret key used for Flask's sessions
"""
DATABASE_URL = os.environ.get("DATABASE_URL")
SECRET_KEY = os.environ.get("SECRET_KEY")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set")

db_engine = create_engine(DATABASE_URL)

DEFAULT_TRANSPORT_TYPE = "Car"
TRANSPORT_MODE_DEFAULTS = {
    "Car": {"speedMultiplier": 60, "isEcoFriendly": False, "energyEfficiency": 25},
    "Bicycle": {"speedMultiplier": 18, "isEcoFriendly": True, "energyEfficiency": 90},
    "Bus": {"speedMultiplier": 40, "isEcoFriendly": False, "energyEfficiency": 45},
    "Walking": {"speedMultiplier": 5, "isEcoFriendly": True, "energyEfficiency": 100},
}

"""
Create a Flask instance of the current file.
__name__ denotes the current file, value varies by whether this file is imported or ran directly.
"""
webApp = Flask(__name__)
webApp.secret_key = SECRET_KEY # Sets the secret key for flask to the one stored on Render
CORS(webApp, resources={r"/*": {"origins": "*"}})

"""
Creates a LoginManager instance and initializes it.
TODO: Determine how login will work with react
"""
#login_manager = LoginManager()
#login_manager.init_app(webApp)
#login_manager.login_view = "signup" # Tells flask login where to redirect the user if they're not logged in and they attempted to access a restricted webpage

#--Authentication API--
"""
Helper function to hash passwords for security purposes
"""
def hash_password(pwd):
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd.encode('utf-8'), salt)
    return hashed.decode('utf-8')

"""
Helper function to verify a stored password against one provided by the user
"""
def verify_password(stored_pwd, provided_pwd):
    # TODO: figure out how DB will store password hash for sure
    if isinstance(stored_pwd, memoryview):
        stored_pwd = stored_pwd.tobytes()
    elif isinstance(stored_pwd, str):
        stored_pwd = stored_pwd.encode("utf-8")

    return bcrypt.checkpw(provided_pwd.encode("utf-8"), stored_pwd)

"""
Helper function to create a JWT access token for the given user ID
"""
def create_access_token(userID: int, role: str) -> str:
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is not set")

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(userID),  # subject
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=jwt_expire_minutes)).timestamp()),
        "role": role,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=jwt_algo)

"""
Function to decode and verify a JWT
Raise jwt exceptions if token is invalid or expired
"""
def decode_access_token(token: str) -> dict:
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is not set")
    return jwt.decode(token, SECRET_KEY, algorithms=[jwt_algo])


def get_db_connection():
    return db_engine.connect()


def point_to_pair(value):
    if value is None:
        return None

    if isinstance(value, (list, tuple)) and len(value) == 2:
        return [float(value[0]), float(value[1])]

    # psycopg may return a string representation like "(x,y)"
    if isinstance(value, str):
        numbers = re.findall(r"[-+]?\d*\.?\d+", value)
        if len(numbers) >= 2:
            return [float(numbers[0]), float(numbers[1])]

    # memoryview from psycopg2 for POINT type
    if hasattr(value, 'coords'):
        coords = value.coords[0] if hasattr(value.coords, '__getitem__') else value.coords
        return [float(coords[0]), float(coords[1])]

    raise ValueError(f"Unable to parse coordinate value: {value}")


def lseg_to_pair(value):
    if value is None:
        return None

    if isinstance(value, (list, tuple)) and len(value) == 2:
        return [point_to_pair(value[0]), point_to_pair(value[1])]

    if isinstance(value, str):
        parts = re.findall(r"\(([^)]+)\)", value)
        if len(parts) >= 2:
            coords = []
            for part in parts[:2]:
                nums = re.findall(r"[-+]?\d*\.?\d+", part)
                if len(nums) >= 2:
                    coords.append([float(nums[0]), float(nums[1])])
            if len(coords) == 2:
                return coords

    raise ValueError(f"Unable to parse line segment value: {value}")


def ensure_transport_mode_id(connection, transport_type: str | None) -> int:
    normalized = transport_type if transport_type in TRANSPORT_MODE_DEFAULTS else DEFAULT_TRANSPORT_TYPE
    existing_id = connection.execute(
        text(
            """
            SELECT transportID
            FROM MODE_OF_TRANSPORT
            WHERE transportType = :tt
            ORDER BY transportID
            LIMIT 1
            """
        ),
        {"tt": normalized},
    ).scalar_one_or_none()

    if existing_id is not None:
        return existing_id

    defaults = TRANSPORT_MODE_DEFAULTS.get(normalized, TRANSPORT_MODE_DEFAULTS[DEFAULT_TRANSPORT_TYPE])
    created_id = connection.execute(
        text(
            """
            INSERT INTO MODE_OF_TRANSPORT (speedMultiplier, isEcoFriendly, transportType, energyEfficiency)
            VALUES (:speedMultiplier, :isEcoFriendly, :transportType, :energyEfficiency)
            RETURNING transportID
            """
        ),
        {
            "speedMultiplier": defaults["speedMultiplier"],
            "isEcoFriendly": defaults["isEcoFriendly"],
            "transportType": normalized,
            "energyEfficiency": defaults["energyEfficiency"],
        },
    ).scalar_one()

    return created_id


def transport_id_exists(connection, transport_id: Optional[int]) -> bool:
    if transport_id is None:
        return False

    row = connection.execute(
        text("SELECT 1 FROM MODE_OF_TRANSPORT WHERE transportID = :tid"),
        {"tid": transport_id},
    ).fetchone()
    return row is not None


def bootstrap_transport_modes():
    with db_engine.begin() as connection:
        for transport_type in TRANSPORT_MODE_DEFAULTS:
            ensure_transport_mode_id(connection, transport_type)


try:
    bootstrap_transport_modes()
except SQLAlchemyError as exc:
    print("Warning: unable to bootstrap transport modes", exc)


def fetch_locations(connection, user_id: int):
    rows = connection.execute(
        text(
            """
            SELECT
                locationID   AS "locationID",
                coordinate   AS "coordinate",
                locationName AS "locationName",
                locationType AS "locationType",
                isPublic     AS "isPublic",
                maxCapacity  AS "maxCapacity",
                parkingSpaces AS "parkingSpaces",
                createdBy    AS "createdBy"
            FROM CELL
            WHERE createdBy = :uid
            ORDER BY locationID
            """
        ),
        {"uid": user_id},
    ).mappings().all()

    locations = []
    for row in rows:
        coord = point_to_pair(row["coordinate"])
        locations.append({
            "locationID": row["locationID"],
            "coordinate": coord,
            "locationName": row["locationName"],
            "locationType": row["locationType"],
            "isPublic": bool(row["isPublic"]),
            "maxCapacity": int(row["maxCapacity"] or 0),
            "parkingSpaces": int(row["parkingSpaces"] or 0),
            "createdBy": row["createdBy"],
        })

    return locations


def fetch_roads(connection):
    rows = connection.execute(
        text(
            """
            SELECT
                roadID      AS "roadID",
                roadSegment AS "roadSegment",
                roadName    AS "roadName",
                distance    AS "distance",
                roadType    AS "roadType"
            FROM ROAD
            ORDER BY roadID
            """
        )
    ).mappings().all()

    roads = []
    for row in rows:
        segment = lseg_to_pair(row["roadSegment"])
        roads.append({
            "roadID": row["roadID"],
            "roadSegment": segment,
            "roadName": row["roadName"],
            "distance": float(row["distance"]),
            "roadType": row["roadType"],
        })

    return roads


def fetch_saved_routes(connection, user_id: int):
    rows = connection.execute(
        text(
            """
            SELECT
                routeID          AS "routeID",
                storedBy         AS "storedBy",
                modeOfTransportID AS "modeOfTransportID",
                startCellCoord   AS "startCellCoord",
                endCellCoord     AS "endCellCoord",
                travelTime       AS "travelTime",
                totalDistance    AS "totalDistance",
                totalCost        AS "totalCost",
                directions       AS "directions"
            FROM TRAVEL_ROUTE
            WHERE storedBy = :uid
            ORDER BY routeID DESC
            """
        ),
        {"uid": user_id},
    ).mappings().all()

    routes = []
    for row in rows:
        directions = row["directions"] if isinstance(row["directions"], list) else []
        routes.append({
            "routeID": row["routeID"],
            "storedBy": row["storedBy"],
            "modeOfTransportID": row["modeOfTransportID"],
            "startCellCoord": point_to_pair(row["startCellCoord"]),
            "endCellCoord": point_to_pair(row["endCellCoord"]),
            "travelTime": row["travelTime"],
            "totalDistance": row["totalDistance"],
            "totalCost": row["totalCost"],
            "directions": directions,
        })

    return routes


def delete_user_records(connection, user_id: int) -> bool:
    connection.execute(
        text("DELETE FROM TRAVEL_ROUTE WHERE storedBy = :uid"),
        {"uid": user_id},
    )
    connection.execute(
        text("DELETE FROM CELL WHERE createdBy = :uid"),
        {"uid": user_id},
    )
    result = connection.execute(
        text("DELETE FROM USERS WHERE userID = :uid"),
        {"uid": user_id},
    )
    return result.rowcount > 0


def require_auth(required_role: str | None = None, enforce_user_match: bool = False):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return jsonify({"message": "Missing or invalid Authorization header"}), 401

            token = auth_header.split(' ', 1)[1].strip()
            try:
                payload = decode_access_token(token)
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                return jsonify({"message": "Invalid or expired token"}), 401

            user_id = int(payload.get('sub'))
            with get_db_connection() as connection:
                row = connection.execute(
                    text(
                        """
                        SELECT userID AS "userID", username, email, userRole AS "userRole"
                        FROM USERS
                        WHERE userID = :uid
                        """
                    ),
                    {"uid": user_id},
                ).mappings().fetchone()

            if row is None:
                return jsonify({"message": "User not found"}), 401

            role = row["userRole"]
            if required_role and role != required_role:
                return jsonify({"message": "Forbidden"}), 403

            if enforce_user_match:
                path_user = kwargs.get('user_id') or request.view_args.get('user_id')
                if path_user is not None and int(path_user) != user_id:
                    return jsonify({"message": "Forbidden"}), 403

            g.current_user = {
                "user_id": user_id,
                "username": row["username"],
                "email": row["email"],
                "role": role,
            }

            return func(*args, **kwargs)

        return wrapper

    return decorator

"""
Function that runs when the user attempts to create an account
"""
@webApp.route("/create_account", methods = ["POST"])
def createAccount():
    #Check the front end input
    email = request.form.get("email")
    username = request.form.get("username")
    password = request.form.get("password")
    ##Reject and tell the front end if input is rejected
    if not email or not username or not password:
        return jsonify({
            "success": False,
            "message": "Missing email, username, or password"
        }), 400

    """
    Add checks for email and username
    """
    if "@" not in email or "." not in email:
        return jsonify({
            "success": False,
            "message": "Invalid email format."
        }), 400

    if len(username) < 3:
        return jsonify({
            "success": False,
            "message": "Username must be at least 3 characters in length."
        }), 400

    pwd_hash = hash_password(password)
    reg_date = datetime.utcnow().date().isoformat()
    default_role = "mapper"

    try:
        with db_engine.begin() as connection:
            existing = connection.execute(
                text(
                    """
                    SELECT 1
                    FROM USERS
                    WHERE email = :email OR username = :username
                    """
                ),
                {"email": email, "username": username},
            ).fetchone()

            if existing is not None:
                return jsonify({
                    "success": False,
                    "message": "Email or username already in use"
                }), 409

            result = connection.execute(
                text(
                    """
                    INSERT INTO USERS (email, username, userPassword, registrationDate, userRole)
                    VALUES (:email, :username, :pwd_hash, :reg_date, :role)
                    RETURNING userID AS "userID", userRole AS "userRole"
                    """
                ),
                {
                    "email": email,
                    "username": username,
                    "pwd_hash": pwd_hash,
                    "reg_date": reg_date,
                    "role": default_role,
                },
            ).mappings().fetchone()

        user_id = result["userID"]
        role = result["userRole"]
        access_token = create_access_token(user_id, role)

        return jsonify({
            "success": True,
            "message": "Account created successfully.",
            "data": {
                "user_id": user_id,
                "username": username,
                "email": email,
                "role": role,
                "token": access_token
            }

        }), 201
    except SQLAlchemyError as e:
        print("Error: ", e)
        return jsonify({
            "success": False,
            "message": "Internal server error"
        }), 500
    #TODO: Add entry in DB for user graph, copy it from some defaults value table OR if you want to store the default graph somewhere else, grab it and put it in the user's entry

"""
Function that runs when the user attempts to sign in
"""
@webApp.route("/sign_in", methods = ["POST"])
def signIn():
    #Check the front end input
    username = request.form.get("username")
    password = request.form.get("password")

    #Reject and tell the front end if input is rejected
    if not password or not username:
        return jsonify({
            "success": False,
            "message": "Missing username or password"
        }), 400

    try:
        with get_db_connection() as connection:
            user_row = connection.execute(
                text(
                    """
                    SELECT userID AS "userID", username, email, userPassword AS "userPassword", userRole AS "userRole"
                    FROM USERS
                    WHERE username = :username
                    """
                ),
                {"username": username},
            ).mappings().fetchone()

        if user_row is None:
            return jsonify({
                "success": False,
                "message": "Username or password is incorrect."
            }), 401

        user_id = user_row["userID"]
        email = user_row["email"]
        pwd_hash = user_row["userPassword"]
        role = user_row["userRole"]

        if not verify_password(pwd_hash, password):
            return jsonify({
                "success": False,
                "message": "Invalid password."
            }), 401

        access_token = create_access_token(user_id, role)

        return jsonify({
            "success": True,
            "message": "User logged in successfully.",
            "data": {
                "user_id": user_id,
                "username": username,
                "email": email,
                "role": role,
                "token": access_token
            }
        }), 200

    except SQLAlchemyError as e:
        print("Error: ", e)
        return jsonify({
            "success": False,
            "message": "Internal server error"
        }), 500
#----------------------

#--API Methods for Frontend--
@webApp.route("/<int:user_id>/getGraph", methods=["GET"])
@require_auth(enforce_user_match=True)
def getGraph(user_id):
    try:
        with get_db_connection() as connection:
            locations = fetch_locations(connection, user_id)
            roads = fetch_roads(connection)
        return jsonify({"locations": locations, "roads": roads}), 200
    except (ValueError, SQLAlchemyError) as exc:
        print("Error loading graph", exc)
        return jsonify({"message": "Failed to load user graph"}), 500

"""
Updates a specified user's graph with a location
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form with important information as to the new location details (name, coordinates, capacity, etc)
"""
@webApp.route("/<int:user_id>/addLocation", methods=["POST"])
@require_auth(enforce_user_match=True)
def addLocation(user_id):
    payload = request.get_json() or {}
    coordinate = payload.get("coordinate")
    if not coordinate or len(coordinate) != 2:
        return jsonify({"message": "coordinate is required"}), 400

    try:
        with db_engine.begin() as connection:
            result = connection.execute(
                text(
                    """
                    INSERT INTO CELL (coordinate, locationName, locationType, isPublic,
                                      maxCapacity, parkingSpaces, createdBy)
                    VALUES (point(:x, :y), :name, :type, :public, :capacity, :parking, :uid)
                    RETURNING locationID AS "locationID"
                    """
                ),
                {
                    "x": coordinate[0],
                    "y": coordinate[1],
                    "name": payload.get("locationName"),
                    "type": payload.get("locationType"),
                    "public": bool(payload.get("isPublic")),
                    "capacity": payload.get("maxCapacity", 0),
                    "parking": payload.get("parkingSpaces", 0),
                    "uid": user_id,
                },
            ).mappings().fetchone()

        return jsonify({"success": True, "locationID": result["locationID"]}), 201
    except SQLAlchemyError as exc:
        print("Error adding location", exc)
        return jsonify({"message": "Unable to add location"}), 500

"""
Updates a specified user's graph by removing a location
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form/JSON with the coordinates of what location to remove
"""
@webApp.route("/<int:user_id>/removeLocation", methods=["DELETE"])
@require_auth(enforce_user_match=True)
def removeLocation(user_id):
    payload = request.get_json() or {}
    location_id = payload.get("locationID")
    if not location_id:
        return jsonify({"message": "locationID is required"}), 400

    try:
        with db_engine.begin() as connection:
            connection.execute(
                text("DELETE FROM CELL WHERE locationID = :lid AND createdBy = :uid"),
                {"lid": location_id, "uid": user_id},
            )

        return jsonify({"success": True}), 200
    except SQLAlchemyError as exc:
        print("Error removing location", exc)
        return jsonify({"message": "Unable to remove location"}), 500

"""
Updates a specified user's graph by updating a location
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form/JSON with the coordinates of what location to update, alongside all location-based information
"""
@webApp.route("/<int:user_id>/updateLocation", methods=["PUT"])
@require_auth(enforce_user_match=True)
def updateLocation(user_id):
    payload = request.get_json() or {}
    location_id = payload.get("locationID")
    if not location_id:
        return jsonify({"message": "locationID is required"}), 400

    fields = {
        "locationName": payload.get("locationName"),
        "locationType": payload.get("locationType"),
        "isPublic": payload.get("isPublic"),
        "maxCapacity": payload.get("maxCapacity"),
        "parkingSpaces": payload.get("parkingSpaces"),
    }
    coordinate = payload.get("coordinate")
    assignments = []
    params = {"locationID": location_id, "uid": user_id}

    for column, value in fields.items():
        if value is not None:
            assignments.append(f"{column} = :{column}")
            params[column] = value

    if coordinate and len(coordinate) == 2:
        assignments.append("coordinate = point(:coord_x, :coord_y)")
        params["coord_x"], params["coord_y"] = coordinate

    if not assignments:
        return jsonify({"message": "No fields to update"}), 400

    query = "UPDATE CELL SET " + ", ".join(assignments) + " WHERE locationID = :locationID AND createdBy = :uid"

    try:
        with db_engine.begin() as connection:
            connection.execute(text(query), params)
        return jsonify({"success": True}), 200
    except SQLAlchemyError as exc:
        print("Error updating location", exc)
        return jsonify({"message": "Unable to update location"}), 500

@webApp.route("/<int:user_id>/removeSavedPath", methods=["POST"])
@require_auth(enforce_user_match=True)
def removeSavedPath(user_id):
    payload = request.get_json() or {}
    route_id = payload.get("routeID")
    if not route_id:
        return jsonify({"message": "routeID is required"}), 400

    try:
        with db_engine.begin() as connection:
            connection.execute(
                text("DELETE FROM TRAVEL_ROUTE WHERE routeID = :rid AND storedBy = :uid"),
                {"rid": route_id, "uid": user_id},
            )
        return jsonify({"success": True}), 200
    except SQLAlchemyError as exc:
        print("Error removing saved path", exc)
        return jsonify({"message": "Unable to remove saved route"}), 500

@webApp.route("/<int:user_id>/computePath", methods=["POST"])
@require_auth(enforce_user_match=True)
def computePath(user_id):
    payload = request.get_json() or {}
    start = payload.get("startCoord")
    end = payload.get("endCoord")
    pit_stops = payload.get("pitStops", [])

    if not start or not end:
        return jsonify({"message": "startCoord and endCoord are required"}), 400

    try:
        with get_db_connection() as connection:
            adjacency, _ = build_road_graph(connection)

        path, total_distance = aStarSearch(user_id, start, end, pit_stops, adjacency)
        if path is None:
            return jsonify({"message": "No path found", "path": []}), 404

        path_list = [[coord[0], coord[1]] for coord in path]
        summary = {
            "path": path_list,
            "totalDistance": total_distance,
            "totalTime": total_distance,
            "totalCost": 0,
            "directions": [f"Proceed to {pt}" for pt in path_list],
            "closedAreas": [],
        }
        return jsonify(summary), 200
    except (ValueError, SQLAlchemyError) as exc:
        print("Error computing path", exc)
        return jsonify({"message": "Unable to compute path"}), 500

@webApp.route("/<int:user_id>/saveRoute", methods=["POST"])
@require_auth(enforce_user_match=True)
def saveRoute(user_id):
    payload = request.get_json() or {}
    start = payload.get("startCellCoord")
    end = payload.get("endCellCoord")
    if not start or not end:
        return jsonify({"message": "startCellCoord and endCellCoord are required"}), 400

    try:
        with db_engine.begin() as connection:
            transport_type = payload.get("transportType")
            transport_id = payload.get("modeOfTransportID")

            if transport_type:
                transport_id = ensure_transport_mode_id(connection, transport_type)
            elif not transport_id_exists(connection, transport_id):
                transport_id = ensure_transport_mode_id(connection, DEFAULT_TRANSPORT_TYPE)

            route_id = connection.execute(
                text(
                    """
                    INSERT INTO TRAVEL_ROUTE (
                        storedBy, modeOfTransportID, startCellCoord, endCellCoord,
                        travelTime, totalDistance, totalCost, directions
                    ) VALUES (
                        :storedBy, :mode, point(:sx, :sy), point(:ex, :ey),
                        :travelTime, :totalDistance, :totalCost, :directions
                    )
                    RETURNING routeID
                    """
                ),
                {
                    "storedBy": user_id,
                    "mode": transport_id,
                    "sx": start[0],
                    "sy": start[1],
                    "ex": end[0],
                    "ey": end[1],
                    "travelTime": payload.get("travelTime", ""),
                    "totalDistance": payload.get("totalDistance", ""),
                    "totalCost": payload.get("totalCost", ""),
                    "directions": payload.get("directions", []),
                },
            ).scalar_one()

        return jsonify({"success": True, "routeID": route_id}), 201
    except SQLAlchemyError as exc:
        print("Error saving route", exc)
        return jsonify({"message": "Unable to save route"}), 500


@webApp.route("/<int:user_id>/savedRoutes", methods=["GET"])
@require_auth(enforce_user_match=True)
def getSavedRoutes(user_id):
    try:
        with get_db_connection() as connection:
            routes = fetch_saved_routes(connection, user_id)
        return jsonify(routes), 200
    except SQLAlchemyError as exc:
        print("Error loading saved routes", exc)
        return jsonify({"message": "Unable to fetch saved routes"}), 500

@webApp.route("/<int:user_id>/", methods=["GET"])
@require_auth(enforce_user_match=True)
def getProfileData(user_id):
    try:
        with get_db_connection() as connection:
            user_row = connection.execute(
                text(
                    """
                    SELECT
                        userID AS "userID",
                        email AS "email",
                        registrationDate AS "registrationDate",
                        username AS "username",
                        userRole AS "userRole"
                    FROM USERS
                    WHERE userID = :uid
                    """
                ),
                {"uid": user_id},
            ).mappings().fetchone()

            if user_row is None:
                return jsonify({"message": "User not found"}), 404

            locations = fetch_locations(connection, user_id)
            routes = fetch_saved_routes(connection, user_id)

        user_payload = {
            "userID": user_row["userID"],
            "email": user_row["email"],
            "registrationDate": user_row["registrationDate"],
            "username": user_row["username"],
            "role": user_row["userRole"],
        }

        return jsonify({"user": user_payload, "locations": locations, "savedRoutes": routes}), 200
    except SQLAlchemyError as exc:
        print("Error loading profile", exc)
        return jsonify({"message": "Unable to load profile"}), 500


@webApp.route("/<int:user_id>/delete_account", methods=["DELETE"])
@require_auth(enforce_user_match=True)
def delete_account(user_id):
    try:
        with db_engine.begin() as connection:
            deleted = delete_user_records(connection, user_id)

        if not deleted:
            return jsonify({"message": "User not found"}), 404

        return jsonify({"success": True}), 200
    except SQLAlchemyError as exc:
        print("Error deleting account", exc)
        return jsonify({"message": "Unable to delete account"}), 500
#----------------------------

#--Admin analytics--
@webApp.route("/admin/overview", methods=["GET"])
@require_auth(required_role="admin")
def get_admin_overview():
    try:
        with get_db_connection() as connection:
            totals = connection.execute(
                text(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM USERS) AS total_users,
                        (SELECT COUNT(*) FROM CELL) AS total_locations,
                        (SELECT COUNT(*) FROM TRAVEL_ROUTE) AS total_routes,
                        (SELECT COUNT(*) FROM ROAD WHERE roadType = 'blocked') AS blocked_roads,
                        (SELECT COUNT(*) FROM CELL WHERE NOT isPublic) AS pending_requests
                    """
                )
            ).fetchone()

        payload = {
            "totalUsers": totals.total_users,
            "totalLocations": totals.total_locations,
            "totalRoutes": totals.total_routes,
            "blockedRoads": totals.blocked_roads,
            "pendingRequests": totals.pending_requests,
            "lastSync": datetime.utcnow().isoformat() + "Z",
        }
        return jsonify(payload), 200
    except SQLAlchemyError as exc:
        print("Error loading admin overview", exc)
        return jsonify({"message": "Unable to load overview"}), 500


@webApp.route("/admin/users", methods=["GET"])
@require_auth(required_role="admin")
def get_admin_users():
    limit = min(int(request.args.get("limit", 50)), 200)
    offset = max(int(request.args.get("offset", 0)), 0)

    try:
        with get_db_connection() as connection:
            rows = connection.execute(
                text(
                    """
                    WITH location_counts AS (
                        SELECT createdBy AS user_id, COUNT(*) AS total
                        FROM CELL
                        GROUP BY createdBy
                    ),
                    route_counts AS (
                        SELECT storedBy AS user_id, COUNT(*) AS total
                        FROM TRAVEL_ROUTE
                        GROUP BY storedBy
                    )
                    SELECT u.userID, u.username, u.email, u.userRole,
                           COALESCE(loc.total, 0) AS locations,
                           COALESCE(rt.total, 0) AS savedRoutes,
                           u.registrationDate AS lastActive
                    FROM USERS u
                    LEFT JOIN location_counts loc ON loc.user_id = u.userID
                    LEFT JOIN route_counts rt ON rt.user_id = u.userID
                    ORDER BY u.userID
                    LIMIT :limit OFFSET :offset
                    """
                ),
                {"limit": limit, "offset": offset},
            ).mappings().fetchall()

        users = []
        for row in rows:
            users.append({
                "userID": row["userID"],
                "username": row["username"],
                "email": row["email"],
                "role": row["userRole"],
                "locations": row["locations"],
                "savedRoutes": row["savedRoutes"],
                "lastActive": row["lastActive"],
            })

        return jsonify(users), 200
    except SQLAlchemyError as exc:
        print("Error loading admin users", exc)
        return jsonify({"message": "Unable to load user roster"}), 500


@webApp.route("/admin/users/<int:target_id>/role", methods=["PATCH"])
@require_auth(required_role="admin")
def update_admin_user_role(target_id):
    payload = request.get_json() or {}
    new_role = payload.get("role")
    if new_role not in {"admin", "mapper", "viewer"}:
        return jsonify({"message": "Invalid role"}), 400

    try:
        with db_engine.begin() as connection:
            result = connection.execute(
                text("UPDATE USERS SET userRole = :role WHERE userID = :uid"),
                {"role": new_role, "uid": target_id},
            )

        if result.rowcount == 0:
            return jsonify({"message": "User not found"}), 404

        return jsonify({"success": True}), 200
    except SQLAlchemyError as exc:
        print("Error updating user role", exc)
        return jsonify({"message": "Unable to update role"}), 500


@webApp.route("/admin/users/<int:target_id>", methods=["DELETE"])
@require_auth(required_role="admin")
def admin_delete_user(target_id):
    current_admin = g.current_user["user_id"] if hasattr(g, "current_user") else None
    if current_admin == target_id:
        return jsonify({"message": "Cannot delete the currently authenticated admin"}), 400

    try:
        with db_engine.begin() as connection:
            deleted = delete_user_records(connection, target_id)

        if not deleted:
            return jsonify({"message": "User not found"}), 404

        return jsonify({"success": True}), 200
    except SQLAlchemyError as exc:
        print("Error deleting user", exc)
        return jsonify({"message": "Unable to delete user"}), 500


@webApp.route("/admin/activity", methods=["GET"])
@require_auth(required_role="admin")
def get_admin_activity():
    now = datetime.utcnow()
    events = [
        {
            "id": f"sync-{int(now.timestamp())}",
            "timestamp": now.isoformat() + "Z",
            "type": "sync",
            "severity": "info",
            "summary": "System sync completed successfully.",
        },
        {
            "id": f"roads-{int(now.timestamp())}",
            "timestamp": now.isoformat() + "Z",
            "type": "mutation",
            "severity": "warn",
            "summary": "Monitoring blocked road segments for congestion.",
        },
    ]
    return jsonify(events), 200
#----------------------------

#--Miscellaneous functions--
@webApp.route("/", methods=["GET"])
def getInitialPage():
    return jsonify({"status": "ok"}), 200

def getRouteInformation(user_id, shortest_route):
    #Find the user's graph from the DB using user_id, grab certain info from the DB about the grid (cost, distance, etc)
    #Take the shortest_route, iteratively check from node-to-node information from the user's graph, update resulting dictionary as you find new info (like updating total distance, or list of directions)
    #Return the resulting dictionary
    pass

# TODO: check over following code

def normalize_coord(coord):
    if coord is None or len(coord) != 2:
        raise ValueError("Coordinates must be a 2-element sequence")

    x, y = coord
    return (float(x), float(y))

def build_road_graph(connection_to_db):
    adjacency = defaultdict(list)
    edge_info = {}

    db_output = connection_to_db.execute(
        text("SELECT roadID, roadSegment, roadName, distance, roadType FROM ROAD")
    )
    rows = db_output.fetchall()

    for roadID, roadSegment, roadName, distance, roadType in rows:
        if not roadSegment or len(roadSegment) != 2:  # roadSegment expected to be [(x1, y1), (x2, y2)]
            continue

        p1 = normalize_coord(roadSegment[0])
        p2 = normalize_coord(roadSegment[1])
        weight = float(distance)

        # undirected edge
        adjacency[p1].append((p2, weight))
        adjacency[p2].append((p1, weight))

        key = (p1, p2) if p1 <= p2 else (p2, p1)
        edge_info[key] = {
            "roadID": roadID,
            "roadName": roadName,
            "distance": weight,
            "roadType": roadType,
        }

    return adjacency, edge_info

def heuristic(a, b):
    ax, ay = normalize_coord(a)
    bx, by = normalize_coord(b)
    return max(abs(ax - bx), abs(ay - by))

def a_star(start, goal, adjacency):
    start = normalize_coord(start)
    goal = normalize_coord(goal)

    open_set = []
    heapq.heappush(open_set, (0.0, start))
    came_from = {}
    g_score = {start: 0.0}

    while open_set:
        current_f, current = heapq.heappop(open_set)
        if current == goal:  # reconstruct path
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)

            path.reverse()
            return path, g_score[goal]

        # if stale entry then we skip because found better path
        if current_f > g_score.get(current, float("inf")) + heuristic(current, goal):
            continue

        for neighbor, weight in adjacency.get(current, []):
            tentative_g = g_score[current] + float(weight)

            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f_score = tentative_g + heuristic(neighbor, goal)
                heapq.heappush(open_set, (f_score, neighbor))

    return None, None  # no valid path

def aStarSearch(user_id, start, end, pitstops, adjacency):
    # Grab the necessary information given by the front end (see message above for all various information needed)
    # Do an A* search using the information given
    # Format resulting path in a nice and easy to utilize way (JSON?)
    # Send to front end to parse and load

    current = normalize_coord(start)
    final_goal = normalize_coord(end)
    pitstops = [normalize_coord(p) for p in (pitstops or [])]

    full_path = []
    total_cost = 0.0

    targets = pitstops + [final_goal]

    for target in targets:
        segment_path, segment_cost = a_star(current, target, adjacency)
        if segment_path is None:
            # Fallback: draw a direct segment if the road graph lacks a path
            direct_distance = heuristic(current, target)
            segment_path = [current, target]
            segment_cost = direct_distance

        # when chaining segments avoid duplicating junction point
        if full_path:
            full_path.extend(segment_path[1:])

        else:
            full_path.extend(segment_path)

        total_cost += segment_cost
        current = target

    return full_path, total_cost
#---------------------------