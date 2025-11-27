"""
Back-end code to connect the front-end portion of the web application to the database.
Written in Python using Flask.

Authors: Jason Duong, Yahya Asmara, Abdulrahman Negmeldin
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
import math
from itertools import combinations
from functools import wraps
from typing import Optional, Mapping

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


"""
Basic helper function used to connect to the database
"""
def get_db_connection():
    return db_engine.connect()



"""
Enforce authentication rules on route handlers
"""
def require_auth(required_role: str | None = None, enforce_user_match: bool = False):
    """

    :param required_role: if provided then only users with this role can access this route
    :param enforce_user_match: if True then ensure that the authenticated user matches the user_id in the route
    :return:
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            #extract authorization header and ensure it starts with Bearer
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return jsonify({"message": "Missing or invalid Authorization header"}), 401

            #extract JWT token from header
            token = auth_header.split(' ', 1)[1].strip()
            try:
                #decode and validate the JWT token
                payload = decode_access_token(token)
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                return jsonify({"message": "Invalid or expired token"}), 401
            #extract the authenticated user's ID from the token payload
            user_id = int(payload.get('sub'))
            #look the user up in the database to ensure they still exist and get their role
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
            #user not found, deny access
            if row is None:
                return jsonify({"message": "User not found"}), 401

            role = row["userRole"]
            #enforce role requirement if required
            if required_role and role != required_role:
                return jsonify({"message": "Forbidden"}), 403

            #enforce user_id match when required
            if enforce_user_match:
                path_user = kwargs.get('user_id') or request.view_args.get('user_id')
                if path_user is not None and int(path_user) != user_id:
                    return jsonify({"message": "Forbidden"}), 403
            #store authenticated user info in Flask global context
            g.current_user = {
                "user_id": user_id,
                "username": row["username"],
                "email": row["email"],
                "role": role,
            }
            #proceed to protected route handler
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

    pwd_hash = hash_password(password)#hash the password for security in the database
    reg_date = datetime.utcnow().date().isoformat() #date of account creation (now)
    default_role = "mapper" #provide default role to user which is a mapper, normal user

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
        #try to find user
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
        #user not found
        if user_row is None:
            return jsonify({
                "success": False,
                "message": "Username or password is incorrect."
            }), 401

        user_id = user_row["userID"]
        email = user_row["email"]
        pwd_hash = user_row["userPassword"]
        role = user_row["userRole"]

        #verify password hash
        if not verify_password(pwd_hash, password):
            return jsonify({
                "success": False,
                "message": "Invalid password."
            }), 401
        #create access token
        access_token = create_access_token(user_id, role)

        #return information in an orderly fashion
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
    #error handling
    except SQLAlchemyError as e:
        print("Error: ", e)
        return jsonify({
            "success": False,
            "message": "Internal server error"
        }), 500
#----------------------

#--API Methods for Frontend--

"""
Convert various point formats into [x, y] float pair 
"""
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

"""
Convert various line segment formats into [[x1, y1], [x2, y2]] coordinate pairs
"""
def lseg_to_pair(value):
    if value is None:
        return None

    if isinstance(value, (list, tuple)) and len(value) == 2:
        return [point_to_pair(value[0]), point_to_pair(value[1])]

    #parse "(x1,y1),(x2,y2)" style string
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

"""
Ensure transport mode exists
Return its ID or create it using default values 
"""
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

    #if it does exist, return its ID
    if existing_id is not None:
        return existing_id

    #does not exist so create a transport mode with a ID
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

    return created_id #return the ID of the created transport ID

"""
Check whether a transport mode with the given ID exists in the database
Obviously do not want two transport modes with the same ID
"""
def transport_id_exists(connection, transport_id: Optional[int]) -> bool:
    if transport_id is None:
        return False

    row = connection.execute(
        text("SELECT 1 FROM MODE_OF_TRANSPORT WHERE transportID = :tid"),
        {"tid": transport_id},
    ).fetchone()
    return row is not None

"""
Preload all default transport modes into the database if missing
"""
def bootstrap_transport_modes():
    with db_engine.begin() as connection:
        for transport_type in TRANSPORT_MODE_DEFAULTS:
            ensure_transport_mode_id(connection, transport_type)

"""
Initialize transport modes at startup
Ignore failures but provide warning if needed
"""
try:
    bootstrap_transport_modes()
except SQLAlchemyError as exc:
    print("Warning: unable to bootstrap transport modes", exc)


#----Road related functions----

"""
Fetch all locations created by a specific user (through their user_id)
"""
def fetch_locations(connection, user_id: int):
    #select rows with all information related to location
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
    #add info to the locations list
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

    return locations #return list

"""
Fetch all roads and their related information
"""
def fetch_roads(connection):
    #select rows with all information related to the road
    rows = connection.execute(
        text(
            """
            SELECT
                r.roadID      AS "roadID",
                r.roadSegment AS "roadSegment",
                r.roadName    AS "roadName",
                r.distance    AS "distance",
                r.roadType    AS "roadType",
                c.locationID  AS "locationID",
                c.locationName AS "locationName",
                c.coordinate  AS "coordinate",
                u.username    AS "owner"
            FROM ROAD r
            LEFT JOIN CONNECTS_TO ct ON ct.roadID = r.roadID
            LEFT JOIN CELL c ON c.locationID = ct.locationID
            LEFT JOIN USERS u ON u.userID = c.createdBy
            ORDER BY r.roadID
            """
        )
    ).mappings().all()

    roads = {}
    #add information to dict
    for row in rows:
        road_id = row["roadID"]
        #build base road entry if not created yet
        if road_id not in roads:
            segment = lseg_to_pair(row["roadSegment"])
            roads[road_id] = {
                "roadID": road_id,
                "roadSegment": segment,
                "roadName": row["roadName"],
                "distance": float(row["distance"]),
                "roadType": row["roadType"],
                "connectedLocations": [],
            }
        #attach connected locations without duplicates
        if row["locationID"] is not None:
            entry_list = roads[road_id]["connectedLocations"]
            if not any(existing.get("locationID") == row["locationID"] for existing in entry_list):
                entry_list.append({
                    "locationID": row["locationID"],
                    "locationName": row["locationName"],
                    "coordinate": point_to_pair(row["coordinate"]),
                    "owner": row["owner"],
                })

    return list(roads.values()) #return the information as a list of values

"""
Fetch all saved routes created by a specific user (through their user_id)
"""
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

"""
Ensure a road-location relationship exists (ignoring duplicates)
"""
def ensure_connects_to(connection, road_id: int, location_id: int):
    connection.execute(
        text(
            """
            INSERT INTO CONNECTS_TO (roadID, locationID)
            VALUES (:road_id, :location_id)
            ON CONFLICT DO NOTHING
            """
        ),
        {"road_id": road_id, "location_id": location_id},
    )

"""
Check if a road segment already exists between two coordinates
"""
def road_segment_exists(connection, coord_a, coord_b):
    return connection.execute(
        text(
            """
            SELECT roadID AS "roadID"
            FROM ROAD
            WHERE roadSegment = lseg(point(:ax, :ay), point(:bx, :by))
               OR roadSegment = lseg(point(:bx, :by), point(:ax, :ay))
            LIMIT 1
            """
        ),
        {
            "ax": coord_a[0],
            "ay": coord_a[1],
            "bx": coord_b[0],
            "by": coord_b[1],
        },
    ).scalar_one_or_none()

"""
Ensure a road exists between two locations and create one if it doesn't
"""
def ensure_road_between_locations(connection, loc_a, loc_b):
    coord_a = tuple(loc_a["coordinate"])
    coord_b = tuple(loc_b["coordinate"])
    if coord_a == coord_b:
        return

    existing = road_segment_exists(connection, coord_a, coord_b)
    #exists!
    if existing is not None:
        ensure_connects_to(connection, existing, loc_a["locationID"])
        ensure_connects_to(connection, existing, loc_b["locationID"])
        return

    #does not exist so create one
    distance = math.dist(coord_a, coord_b)
    road_name = f"AutoRoute {loc_a['locationID']}↔{loc_b['locationID']}"
    road_id = connection.execute(
        text(
            """
            INSERT INTO ROAD (roadSegment, roadName, distance, roadType)
            VALUES (lseg(point(:ax, :ay), point(:bx, :by)), :roadName, :distance, 'unblocked')
            RETURNING roadID AS "roadID"
            """
        ),
        {
            "ax": coord_a[0],
            "ay": coord_a[1],
            "bx": coord_b[0],
            "by": coord_b[1],
            "roadName": road_name,
            "distance": round(distance, 3),
        },
    ).scalar_one()

    ensure_connects_to(connection, road_id, loc_a["locationID"])
    ensure_connects_to(connection, road_id, loc_b["locationID"])

"""
Ensure triangular road connections for a user
Meaning, a road between every pair of locations
"""
def ensure_triangular_roads_for_user(connection, user_id: int):
    locations = fetch_locations(connection, user_id)
    if len(locations) < 3:
        return

    for loc_a, loc_b in combinations(locations, 2):
        ensure_road_between_locations(connection, loc_a, loc_b)


"""
Remove auto generated roads if a user does not have enough locations
"""
def prune_auto_roads_for_user(connection, user_id: int) -> int:
    remaining_locations = fetch_locations(connection, user_id)
    if len(remaining_locations) >= 3:
        return 0

    road_ids = connection.execute(
        text(
            """
            SELECT r.roadID AS "roadID"
            FROM ROAD r
            WHERE r.roadName LIKE 'AutoRoute %'
              AND (
                    NOT EXISTS (
                        SELECT 1
                        FROM CONNECTS_TO ct
                        WHERE ct.roadID = r.roadID
                    )
                    OR NOT EXISTS (
                        SELECT 1
                        FROM CONNECTS_TO ct
                        JOIN CELL c ON c.locationID = ct.locationID
                        WHERE ct.roadID = r.roadID
                          AND c.createdBy <> :uid
                    )
                  )
            """
        ),
        {"uid": user_id},
    ).scalars().all()

    removed = 0
    for rid in road_ids:
        connection.execute(
            text("DELETE FROM CONNECTS_TO WHERE roadID = :rid"),
            {"rid": rid},
        )
        result = connection.execute(
            text("DELETE FROM ROAD WHERE roadID = :rid"),
            {"rid": rid},
        )
        removed += result.rowcount or 0

    return removed


#----Deletion related functions---

"""
Delete a single location entry and its associated routes 
Prune auto generated roads afterwards
"""
def delete_location_entry(connection, location_row: Mapping[str, object]):
    normalized = dict(location_row) #normalize into mutable dict
    coord_pair = point_to_pair(normalized.get("coordinate")) #parse coordinate into [x,y]
    if coord_pair is None:
        raise ValueError("Location coordinate missing")

    owner_id = normalized.get("createdBy") #extract owning user_id
    if owner_id is None:
        raise ValueError("Location owner missing")

    location_id = normalized.get("locationID") #extract location_id
    if location_id is None:
        raise ValueError("Location ID missing")

    x_coord, y_coord = coord_pair
    #delete all routes where this location is either the start or end point
    deleted_routes = connection.execute(
        text(
            """
            DELETE FROM TRAVEL_ROUTE
            WHERE storedBy = :uid
              AND (
                                        (startCellCoord[0] = :x AND startCellCoord[1] = :y)
                                 OR (endCellCoord[0] = :x AND endCellCoord[1] = :y)
              )
            """
        ),
        {"uid": owner_id, "x": x_coord, "y": y_coord},
    )
    #remove location itself
    connection.execute(
        text("DELETE FROM CELL WHERE locationID = :lid AND createdBy = :uid"),
        {"lid": location_id, "uid": owner_id},
    )

    pruned_roads = prune_auto_roads_for_user(connection, owner_id) #clean up

    return deleted_routes.rowcount or 0, pruned_roads #return number of routes deleted and roads pruned


"""
Delete all records belonging to a specific user
This includes routes, locations, user account itself
"""
def delete_user_records(connection, user_id: int) -> bool:
    #remove all routes
    connection.execute(
        text("DELETE FROM TRAVEL_ROUTE WHERE storedBy = :uid"),
        {"uid": user_id},
    )
    #remove all locations created by that user
    connection.execute(
        text("DELETE FROM CELL WHERE createdBy = :uid"),
        {"uid": user_id},
    )
    #remove the user themselves
    result = connection.execute(
        text("DELETE FROM USERS WHERE userID = :uid"),
        {"uid": user_id},
    )
    return result.rowcount > 0

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

            ensure_triangular_roads_for_user(connection, user_id)

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
            row = connection.execute(
                text(
                    """
                    SELECT locationID AS "locationID",
                           coordinate AS "coordinate",
                           createdBy AS "createdBy"
                    FROM CELL
                    WHERE locationID = :lid AND createdBy = :uid
                    FOR UPDATE
                    """
                ),
                {"lid": location_id, "uid": user_id},
            ).mappings().fetchone()

            if row is None:
                return jsonify({"message": "Location not found"}), 404

            removed_routes, pruned_roads = delete_location_entry(connection, row)

        return jsonify({
            "success": True,
            "removedRoutes": removed_routes,
            "prunedRoads": pruned_roads,
        }), 200
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

            existing_route_id = connection.execute(
                text(
                    """
                    SELECT routeID AS "routeID"
                    FROM TRAVEL_ROUTE
                    WHERE storedBy = :storedBy
                      AND modeOfTransportID = :mode
                      AND startCellCoord = point(:sx, :sy)
                      AND endCellCoord = point(:ex, :ey)
                      AND travelTime = :travelTime
                      AND totalDistance = :totalDistance
                      AND totalCost = :totalCost
                      AND directions = :directions
                    LIMIT 1
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
            ).scalar_one_or_none()

            if existing_route_id is not None:
                return jsonify({
                    "success": True,
                    "routeID": existing_route_id,
                    "duplicate": True,
                }), 200

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


@webApp.route("/roads/<int:road_id>/status", methods=["PATCH"])
@require_auth()
def update_road_status(road_id):
    payload = request.get_json() or {}
    new_status = payload.get("roadType")
    if new_status not in {"blocked", "unblocked"}:
        return jsonify({"message": "roadType must be 'blocked' or 'unblocked'"}), 400

    try:
        with db_engine.begin() as connection:
            result = connection.execute(
                text("UPDATE ROAD SET roadType = :rt WHERE roadID = :rid"),
                {"rt": new_status, "rid": road_id},
            )

        if result.rowcount == 0:
            return jsonify({"message": "Road not found"}), 404

        return jsonify({"success": True, "roadType": new_status}), 200
    except SQLAlchemyError as exc:
        print("Error updating road status", exc)
        return jsonify({"message": "Unable to update road"}), 500

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
            roads = fetch_roads(connection)

        user_payload = {
            "userID": user_row["userID"],
            "email": user_row["email"],
            "registrationDate": user_row["registrationDate"],
            "username": user_row["username"],
            "role": user_row["userRole"],
        }

        return jsonify({"user": user_payload, "locations": locations, "savedRoutes": routes, "roads": roads}), 200
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
                    SELECT
                        u.userID AS "userID",
                        u.username AS "username",
                        u.email AS "email",
                        u.userRole AS "userRole",
                        COALESCE(loc.total, 0) AS "locations",
                        COALESCE(rt.total, 0) AS "savedRoutes",
                        u.registrationDate AS "lastActive"
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


@webApp.route("/admin/locations", methods=["GET"])
@require_auth(required_role="admin")
def admin_all_locations():
    try:
        with get_db_connection() as connection:
            rows = connection.execute(
                text(
                    """
                    SELECT
                        c.locationID AS "locationID",
                        c.locationName AS "locationName",
                        c.locationType AS "locationType",
                        c.coordinate AS "coordinate",
                        c.isPublic AS "isPublic",
                        c.maxCapacity AS "maxCapacity",
                        c.parkingSpaces AS "parkingSpaces",
                        COALESCE(u.username, 'Unknown') AS "owner"
                    FROM CELL c
                    LEFT JOIN USERS u ON u.userID = c.createdBy
                    ORDER BY c.locationID
                    """
                )
            ).mappings().all()

        payload = []
        for row in rows:
            payload.append({
                "locationID": row["locationID"],
                "locationName": row["locationName"],
                "locationType": row["locationType"],
                "coordinate": point_to_pair(row["coordinate"]),
                "isPublic": bool(row["isPublic"]),
                "maxCapacity": int(row["maxCapacity"] or 0),
                "parkingSpaces": int(row["parkingSpaces"] or 0),
                "owner": row["owner"],
            })

        return jsonify(payload), 200
    except SQLAlchemyError as exc:
        print("Error loading admin locations", exc)
        return jsonify({"message": "Unable to load locations"}), 500


@webApp.route("/admin/routes", methods=["GET"])
@require_auth(required_role="admin")
def admin_all_routes():
    try:
        with get_db_connection() as connection:
            rows = connection.execute(
                text(
                    """
                    SELECT
                        tr.routeID AS "routeID",
                        tr.startCellCoord AS "startCellCoord",
                        tr.endCellCoord AS "endCellCoord",
                        tr.travelTime AS "travelTime",
                        tr.totalDistance AS "totalDistance",
                        tr.totalCost AS "totalCost",
                        mot.transportType AS "transportType",
                        COALESCE(u.username, 'Unknown') AS "owner"
                    FROM TRAVEL_ROUTE tr
                    LEFT JOIN USERS u ON u.userID = tr.storedBy
                    LEFT JOIN MODE_OF_TRANSPORT mot ON mot.transportID = tr.modeOfTransportID
                    ORDER BY tr.routeID DESC
                    """
                )
            ).mappings().all()

        payload = []
        for row in rows:
            payload.append({
                "routeID": row["routeID"],
                "owner": row["owner"],
                "transportType": row["transportType"],
                "startCellCoord": point_to_pair(row["startCellCoord"]),
                "endCellCoord": point_to_pair(row["endCellCoord"]),
                "totalDistance": row["totalDistance"],
                "totalTime": row["travelTime"],
                "totalCost": row["totalCost"],
            })

        return jsonify(payload), 200
    except SQLAlchemyError as exc:
        print("Error loading admin routes", exc)
        return jsonify({"message": "Unable to load routes"}), 500


def delete_road_record(connection, road_id: int) -> bool:
    restriction_names = connection.execute(
        text(
            """
            SELECT restrictionName AS "name"
            FROM TIME_RESTRICTION
            WHERE roadID = :rid
            """
        ),
        {"rid": road_id},
    ).scalars().all()

    for name in restriction_names:
        connection.execute(
            text("DELETE FROM RESTRICTEDTRANSPORT WHERE restrictionName = :name"),
            {"name": name},
        )

    connection.execute(
        text("DELETE FROM TIME_RESTRICTION WHERE roadID = :rid"),
        {"rid": road_id},
    )
    connection.execute(
        text("DELETE FROM CONNECTS_TO WHERE roadID = :rid"),
        {"rid": road_id},
    )
    result = connection.execute(
        text("DELETE FROM ROAD WHERE roadID = :rid"),
        {"rid": road_id},
    )
    return result.rowcount > 0


@webApp.route("/admin/locations/<int:location_id>", methods=["DELETE"])
@require_auth(required_role="admin")
def admin_delete_location(location_id):
    try:
        with db_engine.begin() as connection:
            row = connection.execute(
                text(
                    """
                    SELECT locationID AS "locationID",
                           coordinate AS "coordinate",
                           createdBy AS "createdBy"
                    FROM CELL
                    WHERE locationID = :lid
                    FOR UPDATE
                    """
                ),
                {"lid": location_id},
            ).mappings().fetchone()

            if row is None:
                return jsonify({"message": "Location not found"}), 404

            removed_routes, pruned_roads = delete_location_entry(connection, row)

        return jsonify({
            "success": True,
            "removedRoutes": removed_routes,
            "prunedRoads": pruned_roads,
        }), 200
    except SQLAlchemyError as exc:
        print("Error deleting admin location", exc)
        return jsonify({"message": "Unable to delete location"}), 500


@webApp.route("/admin/routes/<int:route_id>", methods=["DELETE"])
@require_auth(required_role="admin")
def admin_delete_route(route_id):
    try:
        with db_engine.begin() as connection:
            result = connection.execute(
                text("DELETE FROM TRAVEL_ROUTE WHERE routeID = :rid"),
                {"rid": route_id},
            )

        if result.rowcount == 0:
            return jsonify({"message": "Route not found"}), 404

        return jsonify({"success": True}), 200
    except SQLAlchemyError as exc:
        print("Error deleting admin route", exc)
        return jsonify({"message": "Unable to delete route"}), 500


@webApp.route("/admin/roads", methods=["GET"])
@require_auth(required_role="admin")
def admin_all_roads():
    try:
        with get_db_connection() as connection:
            roads = fetch_roads(connection)
        return jsonify(roads), 200
    except SQLAlchemyError as exc:
        print("Error loading admin roads", exc)
        return jsonify({"message": "Unable to load roads"}), 500


@webApp.route("/admin/roads/<int:road_id>", methods=["DELETE"])
@require_auth(required_role="admin")
def admin_delete_road(road_id):
    try:
        with db_engine.begin() as connection:
            deleted = delete_road_record(connection, road_id)

        if not deleted:
            return jsonify({"message": "Road not found"}), 404

        return jsonify({"success": True}), 200
    except SQLAlchemyError as exc:
        print("Error deleting admin road", exc)
        return jsonify({"message": "Unable to delete road"}), 500


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



"""
Functions used for pathfinding
"""

"""
Function to ensure coordinates are consistent for all pathfinding functions
"""
def normalize_coord(coord):
    if coord is None or len(coord) != 2:
        raise ValueError("Coordinates must be a 2-element sequence")

    x, y = coord
    return (float(x), float(y)) #return x,y coordinates


"""
Function to build the road 
"""
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

"""
The heuristic used in A* pathfinding is Chebyshev 
This function servers to calculate the distance 
"""
def heuristic(a, b):
    ax, ay = normalize_coord(a)
    bx, by = normalize_coord(b)
    return max(abs(ax - bx), abs(ay - by))

"""
Actual A* pathfinding code using the start and end goal 
"""
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

"""
Helper function as part of A* pathfinding
Grab the necessary information given by the front end (see message above for all various information needed)
Do an A* search using the information given
Format resulting path in a nice and easy to utilize way 
Return full path and cost 
"""
def aStarSearch(user_id, start, end, pitstops, adjacency):
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