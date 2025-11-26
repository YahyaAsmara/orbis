"""
Back-end code to connect the front-end portion of the web application to the database.
Written in Python using Flask.

Author: 
"""

"""
TODO: REMOVE THIS COMMENT BLOCK ONCE APPROPRIATE
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

"""
Uses SQLAlchemy to connect to the database
Imports create_engine as the main entry point into the DB
Imports text to safely inject SQL code into the database
"""
from sqlalchemy import create_engine, text

"""
Import the Flask framework so it can be used.
Import request to handle requests from the front-end.
Import jsonify so communications to the front-end are in the form of JSON.
- JSON is used as this uses the REST standard and JSON is commonly used.
Import session so that flask can manage sessions.
"""
from flask import Flask, request, jsonify, session

"""
Import LoginManager to help with handling log in functionality.
Import login_required to prevent unauthorized users from accessing certain parts of the web application.
Import login_user to allow flask login to keep track of user logins.
Import logout_user to allow flask login to handle user logouts.
Import current_user to allow flask login to keep track of the current user
"""
from flask_login import LoginManager, login_required, login_user, logout_user, current_user

"""
Import the User class so that User objects can be made.
"""
from .User import User

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
jwt_expire_mins = 60*2 #2 hour token

"""
Used for A* 
"""
import heapq
import math
from collections import defaultdict

"""
Gets the database URL from Render's environmental variable named DATABASE_URL (configured in the Render website).
Also gets the secret key used for Flask's sessions
"""
DATABASE_URL = os.environ.get("DATABASE_URL")
SECRET_KEY = os.environ.get("SECRET_KEY")

"""
Create a Flask instance of the current file.
__name__ denotes the current file, value varies by whether this file is imported or ran directly.
"""
webApp = Flask(__name__)
webApp.secret_key = SECRET_KEY # Sets the secret key for flask to the one stored on Render

"""
Creates a LoginManager instance and initializes it.
TODO: Determine how login will work with react
"""
#login_manager = LoginManager()
#login_manager.init_app(webApp)
#login_manager.login_view = "signup" # Tells flask login where to redirect the user if they're not logged in and they attempted to access a restricted webpage

#--Authentication API--
"""
TODO: Maybe use? Depends on how user login sessions are handled
"""
@login_manager.user_loader
def load_user(user_id):


"""
Helper function to hash passwords for security purposes
"""
def hash_password(pwd):
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd.encode('utf-8'), salt)
    return hashed

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
def create_access_token(userID: int) -> str:
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is not set")

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(userID),  # subject
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=jwt_expire_mins)).timestamp()),
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

    #hash password
    pwd_hash = hash_password(password)
    reg_date = datetime.utcnow().date()

    #Connect to DB
    db_engine = create_engine(DATABASE_URL)
    connection_to_db = db_engine.connect()

    #Add entry in DB for user
    try:
        existing = connection_to_db.execute(
            text("""
                SELECT 1
                FROM USERS
                WHERE email = :email OR username = :username
                """),
            {"email": email, "username": username}
        ).fetchone()

        if existing is not None:
            return jsonify({
                "success": False,
                "message": "Email or username already in use"
            }), 409

        result = connection_to_db.execute(
            text("""
                INSERT INTO USERS (email, username, password, registrationDate)
                VALUES (:email, :username, :pwd_hash, :reg_date)
                RETURNING userID
                """),
            {
                "email": email,
                "username": username,
                "pwd_hash": pwd_hash,
                "reg_date": reg_date
            }
        )
        user_id = result.fetchone()[0]
        connection_to_db.commit()

        #issue access token
        access_token = create_access_token(user_id)

        return jsonify({
            "success": True,
            "message": "Account created successfully.",
            "data": {
                "user_id": user_id,
                "username": username,
                "email": email,
                "token": access_token
            }

        }), 201
    except Exception as e:
        connection_to_db.rollback()
        #TODO: maybe return e as well but for now just print in terminal
        print("Error: ", e)
        return jsonify({
            "succes": False,
            "message": "Internal server error"
        }), 500
    finally:
        connection_to_db.close()
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

    #connect to db
    db_engine = create_engine(DATABASE_URL)
    connection_to_db = db_engine.connect()

    try:
        result = connection_to_db.execute(
            text("""
            SELECT userID, username, email, password
            FROM USERS
            WHERE username = :username
            """),
            {"username": username}
        )

        user_row = result.fetchone()
        if user_row is None:
            return jsonify({
                "success": False,
                "message": "Username or password is incorrect."
            }), 401

        user_id, username, email, pwd_hash = user_row

        #verify password
        if not verify_password(pwd_hash, password):
            return jsonify({
                "success": False,
                "message": "Invalid password."
            }), 401

        #valid credentials so issue jwt token
        access_token = create_access_token(user_id)

        return jsonify({
            "success": True,
            "message": "User logged in successfully.",
            "data": {
                "user_id": user_id,
                "username": username,
                "email": email,
                "token": access_token
            }
        }), 200

    except Exception as e:
        #TODO: maybe return e as well but for now print in terminal
        print("Error: ", e)
        return jsonify({
            "success": False,
            "message": "Internal server error"
        }), 500
    finally:
        connection_to_db.close()
#----------------------

#--API Methods for Frontend--
"""
Returns a specified user's graph
PARAMS
- user_id => The user ID whose graph will be returned
"""
@webApp.route("/<user_id>/getGraph", methods = ["GET"])
def getGraph(user_id):
    #--Set up a connection with the database--
    db_engine = create_engine(DATABASE_URL)
    connection_to_db = db_engine.connect()
    #-----------------------------------------

    #--Input checks--
    try:
        user_id = int(user_id) #Check if the ID is an integer
        if user_id < 1: raise Exception #Check if the ID is valid
        db_output = connection_to_db.execute(text("SELECT * FROM USERS WHERE userID = :user_id"), {"user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        connection_to_db.close()
        if len(table) == 0: raise Exception
    except: #Tell the frontend that the backend rejected its input
        return jsonify({"error_message" : "Malformed user ID"}), 400
    #----------------

    result_for_frontend = {#Formats a dictionary that'll be JSONified for the frontend
        "roads" : {},
    }
    
    #--Grab all roads from the DB and populate the dictionary with it--
    db_output = connection_to_db.execute(text("SELECT * FROM ROAD"))
    table = db_output.fetchall() #Get the entire table

    for row in table: #row = (roadID, roadSegment, roadName, distance, roadType)
        result_for_frontend["roads"][row[1]] = { #row[1] = [(x1,y1),(x2,y2)]
            "roadID" : row[0],
            "roadName" : row[2],
            "distance" : row[3],
            "roadType" : row[4]
        }
    #------------------------------------------------------------------

    #--Grab all locations from the DB and populate the dictionary with it--
    db_output = connection_to_db.execute(text("SELECT * FROM CELL WHERE createdBy = :user_id"), {"user_id" : user_id})
    table = db_output.fetchall() #Get the entire table

    for row in table: #row = (locationID, coordinate, locationName, locationType, isPublic, maxCapacity, parkingSpaces, createdBy)
        if result_for_frontend["user_locations"] == None: #No user created locations have been logged yet
            result_for_frontend["user_locations"] = {} #Create an entry in the dictionary to hold user created locations
        
        result_for_frontend["user_locations"][row[1]] = { #row[1] = (x,y) 
            "locationID" : row[0],
            "locationName" : row[2],
            "locationType" : row[3],
            "isPublic" : row[4],
            "maxCapacity" : row[5],
            "parkingSpaces" : row[6],
        }
    #----------------------------------------------------------------------

    #--Close the DB connection--
    connection_to_db.close()
    #---------------------------

    return jsonify(result_for_frontend), 200 #Return the dictionary to the front end

"""
Updates a specified user's graph with a location
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form with important information as to the new location details (name, coordinates, capacity, etc)
"""
@webApp.route("/<user_id>/addLocation", methods = ["POST"])
def addLocation(user_id):
    #--Grab form information--
    coordinate = request.form["coordinate"]
    locationName = request.form["locationName"]
    locationType = request.form["locationType"]
    isPublic = request.form["isPublic"]
    maxCapacity = request.form["maxCapacity"]
    parkingSpaces = request.form["parkingSpaces"]
    acceptedCurrency = request.form["acceptedCurrency"]
    #-------------------------

    #--Set up a connection with the database--
    db_engine = create_engine(DATABASE_URL)
    connection_to_db = db_engine.connect()
    #-----------------------------------------

    #--Validate form information--
    #----user_id----
    try:
        user_id = int(user_id)
        if user_id < 1: raise Exception
        db_output = connection_to_db.execute(text("SELECT * FROM USERS WHERE userID = :user_id"), {"user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if len(table) == 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed user ID"}), 400
    #---------------

    #----coordinate----
    try:
        coordinate_x = coordinate[0]
        coordinate_y = coordinate[1]

        db_output = connection_to_db.execute(text("SELECT roadSegment FROM ROAD"))
        table = db_output.fetchall() #Get the entire table
        location_is_not_valid = True
        for row in table: #row = [(x1,y1),(x2,y2)] 
            end_1_x = row[0][0]
            end_1_y = row[0][1]
            end_2_x = row[1][0]
            end_2_y = row[1][1]

            location_in_end_1 = end_1_x == coordinate_x and end_1_y == coordinate_y
            location_in_end_2 = end_2_x == coordinate_x and end_2_y = coordinate_y
            if location_in_end_1 or location_in_end_2: 
                location_is_not_valid = False
                break
        if location_is_not_valid: raise Exception

        db_output = connection_to_db.execute(text("SELECT * FROM CELL WHERE coordinate = '(:coordinate_x, :coordinate_y)' AND createdBy = :user_id"), {"coordinate_x" : coordinate_x, "coordinate_y" : coordinate_y, "user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if not(len(table) == 0): raise Exception #A location already exists
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed location coordinates"}), 400
    #------------------

    #----locationName----
    try:
        allowed_symbols = set(string.ascii_letters + string.digits) # Constructs a set filled with alphanumeric symbols
        locationName_contains_invalid_symbols = any(character not in allowed_symbols for character in locationName)
        if locationName_contains_invalid_symbols: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Non-alphanumeric location name"}), 400
    #--------------------

    #---locationType----
    if locationType not in ["Hotel", "Park", "Cafe", "Restaurant", "Landmark", "Gas_Station", "Electric_Charging_Station"]:
        connection_to_db.close()
        return jsonify({"error_message" : "Invalid location type"}), 400
    #-------------------

    #----isPublic----
    try:
        if not (isPublic == True or isPublic == False): raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Location neither public nor private"}), 400 
    #----------------

    #----parkingSpaces----
    try:
        parkingSpaces = int(parkingSpaces)
        if parkingSpaces < 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Number of parking spaces invalid"}), 400 
    #---------------------

    #----acceptedCurrency----
    if not (acceptedCurrency == None): #There is a currency given for this location
        for currency in acceptedCurrency: #Check each given currency in the list
            db_output = connection_to_db.execute(text("SELECT * FROM CURRENCY WHERE currencyName = :currency"), {"currency" : currency})
            table = db_output.fetchall() #Get the entire table
            if not (len(table) == 1): return jsonify({"error_message" : f"Invalid currency: {currency}"}), 400 
    #------------------------
    #-----------------------------

    #--Insert a new location into the database--
    db_output = connection_to_db.execute(text(
        """
        INSERT INTO CELL (coordinate, locationName, locationType, isPublic, maxCapacity, parkingSpaces, createdBy) 
        VALUES (:coordinate, :locationName, :locationType, :isPublic, :maxCapacity, :parkingSpaces, :createdBy) 
        RETURNING locationID
        """
    ), {
        "coordinate" : f'{coordinate}',
        "locationName" : locationName,
        "locationType" : locationType,
        "isPublic" : isPublic,
        "maxCapacity" : maxCapacity,
        "parkingSpaces" : parkingSpaces,
        "createdBy" : user_id
    })
    table = db_output.fetchall() #Get the entire table
    location_id = table[0][0] #table = [(locationID)]

    if acceptedCurrency != None: #User gave a currency for this location to accept
        for currency in acceptedCurrency: #Add a relationship between each currency and location
            connection_to_db.execute(text("INSERT INTO ACCEPTS (currencyName, locationID) VALUES (:currency, :locationID)"), {
                "currency" : currency,
                "locationID" : location_id
            })
    
    #Add a CONNECTS_TO relationship between all roads that connect to this location
    db_output = connection_to_db.execute(text(
        """
        SELECT roadID from ROAD 
        WHERE (roadSegment)[0] = :coordinate::point OR (roadSegment)[1] = :coordinate::point
        """
    ), {"coordinate" : f'{coordinate}'})
    table = db_output.fetchall() #Get the entire table
    for row in table: #table = [[roadID], [roadID], ...]
        road_id = row[0]
        connection_to_db.execute(text(
            """
            INSERT INTO CONNECTS_TO (roadID, locationID) 
            VALUES (:road_id, :locationID) 
            """
        ), {"road_id" : road_id, "locationID" : location_id})
    #-------------------------------------------

    #--Close the DB connection--
    connection_to_db.commit() #Commit the changes made to the DB
    connection_to_db.close()
    #---------------------------
    
    return jsonify("success" : True), 200

"""
Updates a specified user's graph by removing a location
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form/JSON with the coordinates of what location to remove
"""
@webApp.route("/<user_id>/removeLocation", methods = ["POST"])
def removeLocation(user_id):
    #--Grab form information--
    coordinate = request.form["coordinate"]
    #-------------------------

    #--Set up a connection with the database--
    db_engine = create_engine(DATABASE_URL)
    connection_to_db = db_engine.connect()
    #-----------------------------------------

    #--Validate form information--
    #----user_id----
    try:
        user_id = int(user_id)
        if user_id < 1: raise Exception
        db_output = connection_to_db.execute(text("SELECT * FROM USERS WHERE userID = :user_id"), {"user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if len(table) == 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed user ID"}), 400
    #---------------

    #----coordinate----
    try:
        coordinate_x = coordinate[0]
        coordinate_y = coordinate[1]

        db_output = connection_to_db.execute(text("SELECT * FROM CELL WHERE coordinate = '(:coordinate_x, :coordinate_y)' AND createdBy = :user_id"), {"coordinate_x" : coordinate_x, "coordinate_y" : coordinate_y, "user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if not(len(table) == 1): raise Exception #Location does not exist
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed location coordinates"}), 400
    #------------------
    #-----------------------------

    connection_to_db.execute(text("DELETE FROM CELL WHERE coordinate = '(:coordinate_x, :coordinate_y)' AND createdBy = :user_id"), {"coordinate_x" : coordinate_x, "coordinate_y" : coordinate_y, "user_id" : user_id})

    #--Close the DB connection--
    connection_to_db.commit() #Commit the changes made to the DB
    connection_to_db.close()
    #---------------------------

    return jsonify("success" : True), 200

"""
Updates a specified user's graph by updating a location
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form/JSON with the coordinates of what location to update, alongside all location-based information
"""
@webApp.route("/<user_id>/updateLocation", methods = ["POST"])
def updateLocation(user_id):
    #--Grab form information--
    coordinate = request.form["coordinate"]
    locationName = request.form["locationName"]
    locationType = request.form["locationType"]
    isPublic = request.form["isPublic"]
    maxCapacity = request.form["maxCapacity"]
    parkingSpaces = request.form["parkingSpaces"]
    acceptedCurrency = request.form["acceptedCurrency"]
    #-------------------------

    #--Set up a connection with the database--
    db_engine = create_engine(DATABASE_URL)
    connection_to_db = db_engine.connect()
    #-----------------------------------------

    location_id = None #For use in updating the right row later

    #--Validate form information--
    #----user_id----
    try:
        user_id = int(user_id)
        if user_id < 1: raise Exception
        db_output = connection_to_db.execute(text("SELECT * FROM USERS WHERE userID = :user_id"), {"user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if len(table) == 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed user ID"}), 400
    #---------------

    #----coordinate----
    try:
        coordinate_x = coordinate[0]
        coordinate_y = coordinate[1]

        db_output = connection_to_db.execute(text("SELECT locationID FROM CELL WHERE coordinate = '(:coordinate_x, :coordinate_y)' AND createdBy = :user_id"), {"coordinate_x" : coordinate_x, "coordinate_y" : coordinate_y, "user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if not(len(table) == 1): raise Exception #Location does not exist
        location_id = table[0][0] #table = [(locationID)]
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed location coordinates"}), 400
    #------------------

    #----locationName----
    try:
        allowed_symbols = set(string.ascii_letters + string.digits) # Constructs a set filled with alphanumeric symbols
        locationName_contains_invalid_symbols = any(character not in allowed_symbols for character in locationName)
        if locationName_contains_invalid_symbols: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Non-alphanumeric location name"}), 400
    #--------------------

    #---locationType----
    if locationType not in ["Hotel", "Park", "Cafe", "Restaurant", "Landmark", "Gas_Station", "Electric_Charging_Station"]:
        connection_to_db.close()
        return jsonify({"error_message" : "Invalid location type"}), 400
    #-------------------

    #----isPublic----
    try:
        if not (isPublic == True or isPublic == False): raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Location neither public nor private"}), 400 
    #----------------

    #----parkingSpaces----
    try:
        parkingSpaces = int(parkingSpaces)
        if parkingSpaces < 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Number of parking spaces invalid"}), 400 
    #---------------------

    #----acceptedCurrency----
    if not (acceptedCurrency == None): #There is a currency given for this location
        for currency in acceptedCurrency: #Check each given currency in the list
            db_output = connection_to_db.execute(text("SELECT * FROM CURRENCY WHERE currencyName = :currency"), {"currency" : currency})
            table = db_output.fetchall() #Get the entire table
            if not (len(table) == 1): return jsonify({"error_message" : f"Invalid currency: {currency}"}), 400 
    #------------------------
    #-----------------------------

    #--Update the location with new information--
    connection_to_db.execute(text(
        """
        UPDATE CELL
        SET coordinate = :coordinate, locationName = :locationName, locationType = :locationType, isPublic = :isPublic, maxCapacity = :maxCapacity, parkingSpaces = :parkingSpaces, createdBy = :user_id
        WHERE locationID = :location_id
        """
    ), {
        "coordinate" : f'{coordinate}',
        "locationName" : locationName,
        "locationType" : locationType,
        "isPublic" : isPublic,
        "maxCapacity" : maxCapacity,
        "parkingSpaces" : parkingSpaces,
        "createdBy" : user_id,
        "locationID" : location_id
    })

    #--Remove all relationships in ACCEPTS for this cell--
    connection_to_db.execute(text("DELETE * FROM ACCEPTS WHERE locationID = :location_id"), {"location_id" : location_id})
    #-----------------------------------------------------

    #--Repopulate ACCEPTS relationships between currency and location--
    if acceptedCurrency != None: #User gave a currency for this location to accept
        for currency in acceptedCurrency: #Add a relationship between each currency and location
            connection_to_db.execute(text("INSERT INTO ACCEPTS (currencyName, locationID) VALUES (:currency, :locationID)"), {
                "currency" : currency,
                "locationID" : location_id
            })
    #------------------------------------------------------------------
    #--------------------------------------------
    
    #--Close the DB connection--
    connection_to_db.commit() #Commit the changes made to the DB
    connection_to_db.close()
    #---------------------------

    return jsonify("success" : True), 200

"""
Updates a specified user's graph with a landmark
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form with important information as to the new landmark details
"""
@webApp.route("/<user_id>/addLandmark", methods = ["POST"])
def addLandmark(user_id):
    #Input check, ensure that the new landmark is valid (information is valid, nothing overlaps with graph from DB, etc)
    ##If input failed check, tell front end it was not successful
    #Update DB graph entry with new landmark
    #Tell front end it was successful

"""
Updates a specified user's graph by removing a landmark
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form/JSON with what landmark to remove
"""
@webApp.route("/<user_id>/removeLandmark", methods = ["POST"])
def removeLandmark(user_id):
    #Input check, ensure that the user id and landmark is valid (exists)
    ##If input failed check, tell front end it was not successful
    #Update DB by removing the landmark
    #Tell front end it was successful

"""
Updates a specified user's graph by updating a landmark
PARAMS
- user_id => The user ID whose graph will be updated
- The frontend will send a form/JSON with what landmark to update, alongside all landmark-based information
"""
@webApp.route("/<user_id>/updateLandmark", methods = ["POST"])
def updateLandmark(user_id):
    #Input check, ensure that the user id and landmark info  valid
    ##If input failed check, tell front end it was not successful
    #Update DB
    #Tell front end it was successful

"""
Removes a user's saved path
PARAMS
- routeID -> ID of saved path to remove
"""
@webApp.route("/<user_id>/removeSavedPath", methods = ["POST"])
def removeSavedPath(user_id):
    #--Grab form information--
    route_id = request.form["routeID"]
    #-------------------------

    #--Set up a connection with the database--
    db_engine = create_engine(DATABASE_URL)
    connection_to_db = db_engine.connect()
    #-----------------------------------------

    #--Validate form information--
    #----user_id----
    try:
        user_id = int(user_id)
        if user_id < 1: raise Exception
        db_output = connection_to_db.execute(text("SELECT * FROM USERS WHERE userID = :user_id"), {"user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if len(table) == 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed user ID"}), 400
    #---------------

    #----route_id----
    try:
        route_id = int(route_id)
        if route_id < 1: raise Exception
        db_output = connection_to_db.execute(text("SELECT * FROM TRAVEL_ROUTE WHERE routeID = :route_id AND storedBy = :user_id"), {"route_id" : route_id, "user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if len(table) == 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed route ID"}), 400
    #----------------
    #----End of form validation---

    #--Delete saved path--
    connection_to_db.execute(text(
        """
        DELETE FROM TRAVEL_ROUTE
        WHERE
        routeID = : route_id;
        """
    ), {"route_id" : route_id})
    #---------------------

    #--Close the DB connection--
    connection_to_db.commit() #Commit the changes made to the DB
    connection_to_db.close()
    #---------------------------
    
    return jsonify("success" : True), 200

"""
Sends the front end information about the user specified route, given the provided information (in JSON or a form)
- user_id
- Starting location
- Ending location
- List of pitt stops
- Time of day
- Chosen mode of transport
- TODO: etc... (if I'm missing something)
"""
@webApp.route("/<user_id>/computePath", methods = ["GET"])
def computePath(user_id):
    #Input check, ensure everything given from front end makes sense
    ##If not, reject

    #Call A* search and pass relevant info. Get the shortest path back
    #Call getRouteInformation and pass the shortest path

    #Get the results from the above function calls and put them in a nice and easy to parse (JSON?) format for the front end
    #Send to the front end

"""
Saves a user-specified route
PARAMS:
- modeOfTransportID
- startCellCoord -> As a tuple (x,y)
- endCellCoord -> As a tuple (x,y)
- travelTime -> As a string
- totalDistance -> As a string
- totalCost -> As a string
- directions -> As a list of strings
"""
@webApp.route("/<user_id>/saveRoute", methods = ["POST"])
def saveRoute(user_id):
    #--Grab form information--
    modeOfTransportID = request.form["modeOfTransportID"]
    startCellCoord = request.form["startCellCoord"]
    endCellCoord = request.form["endCellCoord"]
    travelTime = request.form["travelTime"]
    totalDistance = request.form["totalDistance"]
    totalCost = request.form["totalCost"]
    directions = request.form["directions"]
    #-------------------------

    #--Set up a connection with the database--
    db_engine = create_engine(DATABASE_URL)
    connection_to_db = db_engine.connect()
    #-----------------------------------------

    #--Validate form information--
    #----user_id----
    try:
        user_id = int(user_id)
        if user_id < 1: raise Exception
        db_output = connection_to_db.execute(text("SELECT * FROM USERS WHERE userID = :user_id"), {"user_id" : user_id})
        table = db_output.fetchall() #Get the entire table
        if len(table) == 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed user ID"}), 400
    #---------------

    #----modeOfTransportID----
    try:
        modeOfTransportID = int(modeOfTransportID)
        if modeOfTransportID < 1: raise Exception
        db_output = connection_to_db.execute(text("SELECT * FROM MODE_OF_TRANSPORT WHERE transportID = :modeOfTransportID"), {"modeOfTransportID" : modeOfTransportID})
        table = db_output.fetchall() #Get the entire table
        if len(table) == 0: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : "Malformed mode of transport ID"}), 400
    #-------------------------

    #----startCellCoord and endCellCoord----
    startCell_not_valid = True
    endCell_not_valid = True
    try:
        db_output = connection_to_db.execute(text("SELECT roadSegment FROM ROAD"))
        table = db_output.fetchall() #Get the entire table
        for row in table: #row = [(x1,y1),(x2,y2)] 
            end_1 = row[0]
            end_2 = row[1]

            startCell_in_map = startCellCoord == end_1 or startCellCoord == end_2
            endCell_in_map = endCellCoord == end_1 or endCellCoord == end_2

            if startCell_in_map: startCell_not_valid = False
            if endCell_in_map: endCell_not_valid = False
            if not startCell_not_valid and not endCell_not_valid: break #To end the loop early
        if startCell_not_valid or endCell_not_valid: raise Exception
    except:
        connection_to_db.close()
        return jsonify({"error_message" : f"Malformed coordinates: {"startCell" if startCell_not_valid else ""} {"endCell" if endCell_not_valid else ""}"}), 400
    #---------------------------------------

    #----travelTime, totalDistance, totalCost, directions----
    try:
        allowed_symbols = set(string.ascii_letters + string.digits) # Constructs a set filled with alphanumeric symbols

        travelTime_has_bad_symbols = any(character not in allowed_symbols for character in travelTime)
        totalDistance_has_bad_symbols = any(character not in allowed_symbols for character in totalDistance)
        totalCost_has_bad_symbols = any(character not in allowed_symbols for character in totalCost)
        directions_has_bad_symbols = False
        for direction in directions: #Checks every direction step in the list of directions 
            if any(character not in allowed_symbols for character in direction): directions_has_bad_symbols = True #Specific direction in the list is invalid
        
        if travelTime_has_bad_symbols or totalDistance_has_bad_symbols or totalCost_has_bad_symbols or directions_has_bad_symbols:
            error_message = f"""
            Invalid 
            {"travel time " if travelTime_has_bad_symbols}
            {"total distance " if totalDistance_has_bad_symbols}
            {"total cost " if totalCost_has_bad_symbols}
            {"directions " if directions_has_bad_symbols}
            """
            raise Exception(error_message)
    except Exception as error_message:
        connection_to_db.close()
        return jsonify({"error_message" : error_message}), 400
    #--------------------------------------------------------
    #---End of form validation----

    #--Save given route by inserting it into DB--
    db_output = connection_to_db.execute(text(
        """
        INSERT INTO TRAVEL_ROUTE (storedBy, modeOfTransportID, startCellCoord, endCellCoord, travelTime, totalDistance, totalCost, directions) 
        VALUES (:storedBy, :modeOfTransportID, :startCellCoord, :endCellCoord, :travelTime, :totalDistance, :totalCost, :directions) 
        RETURNING routeID
        """
    ), {
        "storedBy" : user_id,
        "modeOfTransportID" : modeOfTransportID,
        "startCellCoord" : startCellCoord,
        "endCellCoord" : endCellCoord,
        "travelTime" : travelTime,
        "totalDistance" : totalDistance,
        "totalCost" : totalCost,
        "directions" : directions 
    })
    table = db_output.fetchall() #Get the entire table
    route_id = table[0][0] #table = [(routeID)]
    #-------------Save route end-----------------

    #--Close the DB connection--
    connection_to_db.commit() #Commit the changes made to the DB
    connection_to_db.close()
    #---------------------------
    
    return jsonify("success" : True, "routeID" : route_id), 200

"""
Retreive all user data that is displayed on the profile page
PARAMS:
- user_id => ID of user
"""
@webApp.route("/<user_id>/", methods = ["GET"])
def getProfileData(user_id):
    #Input check user id
    ##Reject if needed
    
    #Make many DB calls to sort and grab only relevant user data from relevant tables
    #Combine them into something parsable (JSON?)
    #Return that
#----------------------------

#--Miscellaneous functions--
"""
Function that runs when the base webpage is accessed (the sign in page)
"""
@webApp.route("/", methods = ["GET"])
def getInitialPage():
    return send_from_directory("INSERT_PATH_NAME_HERE", "index.html"), 200 # Grab the react file and serve it

"""
Given a path and the ID of the user who requested the route computation, determine additional facts about the route for the front end to display
PARAMS:
- user_id => ID of the user. Needed to grab their grid from the DB
- shortest_route => The shortest route determined from a previously called A* search
RETURN:
- A list (dictionary?) of key information regarding the route (what areas are closed, total distance, total cost, directions in layman terms (no coordinates), etc)
"""
def getRouteInformation(user_id, shortest_route):
    #Find the user's graph from the DB using user_id, grab certain info from the DB about the grid (cost, distance, etc)
    #Take the shortest_route, iteratively check from node-to-node information from the user's graph, update resulting dictionary as you find new info (like updating total distance, or list of directions)
    #Return the resulting dictionary

# TODO: check over following code

"""
Normalize coordinate value from frontend or DB into hashable (x,y) tuple of floats
"""

def normalize_coord(coord):
    if coord is None or len(coord) != 2:
        raise ValueError("Coordinates must be a 2-element sequence")

    x, y = coord
    return (float(x), float(y))

"""
Build adjacency list and edge metadata from ROAD table
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
Heuristic for A*: Euclidean distance between two (x, y) points
Calculzates the Chebsyshev distance between two points a and b 
"""
def heuristic(a, b):
    ax, ay = normalize_coord(a)
    bx, by = normalize_coord(b)
    return max(abs(ax - bx), abs(ay - by))

"""
Core A* implementation on a graph represented by adjacency list 
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
A* search given:
- user_id => The ID of the user (to grab their corresponding graph)
- Starting location
- Ending location
- List of pitstops (empty list if none selected)
- Mode of transport
- etc (if something was missed)
"""

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
            return None, None

        # when chaining segments avoid duplicating junction point
        if full_path:
            full_path.extend(segment_path[1:])

        else:
            full_path.extend(segment_path)

        total_cost += segment_cost
        current = target

    return full_path, total_cost
#---------------------------