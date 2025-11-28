/* 
   File that is used to configure a database on Render
   Written to support PostgreSQL formatting (PostgreSQL is used on Render)
   
   Author: Jason Duong, Yahya Asmara
*/

--USER Table, now renamed USERS because of naming issues--
CREATE TABLE USERS(
   userID SERIAL, --SERIAL = auto-incrementing starting from 1
   email TEXT UNIQUE NOT NULL,
   registrationDate TEXT NOT NULL,
   username TEXT UNIQUE NOT NULL, --Must be unique
   userPassword TEXT NOT NULL,
   userRole TEXT CHECK (userRole IN ('admin', 'mapper', 'viewer')) NOT NULL DEFAULT 'mapper',
   PRIMARY KEY (userID)
);
-----------------------------------------------------------

--LOCATION table, now renamed CELL because of naming issues--
CREATE TABLE CELL(
   locationID SERIAL, 
   coordinate POINT UNIQUE, --POINT = in the form of (x,y)
   locationName TEXT NOT NULL,
   locationType TEXT NOT NULL,
   FOREIGN KEY (locationType) REFERENCES CELL_TYPE_INFO(locationType)
   maxCapacity INTEGER CHECK (maxCapacity >= 0), --no negative capacities
   parkingSpaces INTEGER CHECK (parkingSpaces >= 0), --no negative parking spaces
   createdBy INTEGER, --Foreign key createdBy links to userID in user
   PRIMARY KEY (locationID),
   FOREIGN KEY (createdBy) REFERENCES USERS(userID)
);
-------------------------------------------------------------

--CELL_TYPE_INFO table--
CREATE TABLE CELL_TYPE_INFO(
   locationType TEXT CHECK (locationType IN ('Hotel', 'Park', 'Cafe', 'Restaurant', 'Gas_Station', 'Electric_Charging_Station')), --ensure locationType is an element in the given list
   PRIMARY KEY (locationType)
   isPublic BOOLEAN NOT NULL,
);
------------------------

--LANDMARK table--
CREATE TABLE LANDMARK(
   landmarkName TEXT,
   locationID INTEGER, 
   FOREIGN KEY (locationID) REFERENCES CELL(locationID) ON DELETE CASCADE, --Foreign key locationID links to locationID in cell
   PRIMARY KEY (landmarkName, locationID), --Composite primary key
   landmarkDescription TEXT,
   category TEXT CHECK (category IN ('Mountain', 'River', 'Lake', 'In_City', 'Other')) NOT NULL --ensure category is an element in the given list
);
------------------

--MONEY table, now renamed CURRENCY because of naming issues--
CREATE TABLE CURRENCY(
   currencyName TEXT,
   currencySymbbol TEXT NOT NULL,
   PRIMARY KEY (currencyName)
);
--------------------------------------------------------------

--EXCHANGES_TO table (CURRENCY EXCHANGES_TO CURRENCY)--
CREATE TABLE EXCHANGES_TO(
   currencyFrom TEXT,
   FOREIGN KEY (currencyFrom) REFERENCES CURRENCY(currencyName) ON DELETE CASCADE,
   currencyTo TEXT,
   FOREIGN KEY (currencyTo) REFERENCES CURRENCY(currencyName) ON DELETE CASCADE,
   exchangeRate TEXT NOT NULL,
);
-------------------------------------------------------

--ACCEPTS table (CELL ACCEPTS CURRENCY relationship)--
CREATE TABLE ACCEPTS(
   currencyName TEXT,
   FOREIGN KEY (currencyName) REFERENCES CURRENCY(currencyName) ON DELETE CASCADE, --If referenced currency is deleted, delete this tuple too
   locationID INTEGER,
   FOREIGN KEY (locationID) REFERENCES CELL(locationID) ON DELETE CASCADE, --If referenced location is deleted, delete this tuple too
   PRIMARY KEY (currencyName, locationID)
);
------------------------------------------------------

--ROAD table--
CREATE TABLE ROAD(
   roadID SERIAL, 
   roadSegment LSEG UNIQUE, --LSEG = a line segment defined as [(x1,y1),(x2,y2)]
   PRIMARY KEY (roadID),
   roadName TEXT UNIQUE,
   distance INTEGER NOT NULL,
   roadType TEXT CHECK (roadType IN ('blocked', 'unblocked')) --ensure roadType is an element in the given list
);
--------------

--CONNECTS_TO table (CELL CONNECTS_TO ROAD relationship)--
CREATE TABLE CONNECTS_TO(
   roadID INTEGER,
   FOREIGN KEY (roadID) REFERENCES ROAD(roadID),
   locationID INTEGER,
   FOREIGN KEY (locationID) REFERENCES CELL(locationID) ON DELETE CASCADE,
   PRIMARY KEY (roadID, locationID)
);
----------------------------------------------------------

--TIME_RESTRICTION table--
CREATE TABLE TIME_RESTRICTION(
   restrictionName TEXT,
   PRIMARY KEY (restrictionName),
   startTime TEXT,
   endTime TEXT,
   roadID INTEGER NOT NULL,
   FOREIGN KEY (roadID) REFERENCES ROAD(roadID) ON DELETE CASCADE
);

CREATE TABLE RESTRICTEDTRANSPORT( --Multivalued attribute restrictedTransport for table time_restriction
   restrictionName TEXT,
   FOREIGN KEY (restrictionName) REFERENCES TIME_RESTRICTION(restrictionName) ON DELETE CASCADE,
   transportRestricted TEXT CHECK (transportRestricted IN ('Car', 'Bicycle', 'Bus', 'Walking')), --ensure transportRestricted is an element in the given list
   PRIMARY KEY (restrictionName, transportRestricted)
);
--------------------------

--MODE_OF_TRANSPORT table--
CREATE TABLE MODE_OF_TRANSPORT(
   transportID SERIAL, --SERIAL = auto-incrementing
   PRIMARY KEY (transportID),
   speedMultiplier INTEGER CHECK (speedMultiplier >= 1) NOT NULL, --cannot skip negative nodes per tick
   isEcoFriendly BOOLEAN NOT NULL,
   transportType TEXT CHECK (transportType IN ('Car', 'Bicycle', 'Bus', 'Walking')) NOT NULL, --ensure transportType is an element in the given list
   energyEfficiency INTEGER
);
---------------------------

--ACCESSIBLE_BY table (ROAD ACCESSIBLE_BY MODE_OF_TRANSPORT)--
CREATE TABLE ACCESSIBLE_BY(
   roadID INTEGER,
   FOREIGN KEY (roadID) REFERENCES ROAD(roadID) ON DELETE CASCADE,
   transportID INTEGER,
   FOREIGN KEY (transportID) REFERENCES MODE_OF_TRANSPORT(transportID) ON DELETE CASCADE,
   PRIMARY KEY (roadID, transportID)
);
--------------------------------------------------------------

--VEHICLE table--
CREATE TABLE VEHICLE(
   vehicleID SERIAL, --SERIAL = auto-incrementing starting from 1
   transportID INTEGER,
   FOREIGN KEY (transportID) REFERENCES MODE_OF_TRANSPORT(transportID) ON DELETE CASCADE, --Foreign key locationID links to locationID in cell
   PRIMARY KEY (vehicleID, transportID), --Composite primary key
   vehicleName TEXT NOT NULL,
   FOREIGN KEY (vehicleName) REFERENCES VEHICLE_INFO(vehicleName) ON DELETE CASCADE,
   ownedBy INTEGER,
   FOREIGN KEY (ownedBy) REFERENCES USERS(userID) ON DELETE CASCADE
);
------------------

--VEHICLE_INFO table--
CREATE TABLE VEHICLE_INFO(
   vehicleName TEXT,
   PRIMARY KEY (vehicleName),
   passengerCapacity INTEGER CHECK (passengerCapacity >= 1) NOT NULL
);
----------------------

--TRAVEL_ROUTE table--
CREATE TABLE TRAVEL_ROUTE(
   routeID SERIAL, --SERIAL = auto-incrementing starting from 1
   PRIMARY KEY (routeID),
   modeOfTransportID INTEGER NOT NULL,
   FOREIGN KEY (modeOfTransportID) REFERENCES VEHICLE(transportID) ON DELETE CASCADE,
   vehicleID INTEGER NOT NULL,
   FOREIGN KEY (vehicleID) REFERENCES VEHICLE(vehicleID) ON DELETE CASCADE,
   startCellCoord POINT NOT NULL, --POINT = in the form of (x,y)
   endCellCoord POINT NOT NULL, --POINT = in the form of (x,y)
   travelTime TEXT NOT NULL,
   totalDistance TEXT NOT NULL,
   totalCost TEXT NOT NULL
);
----------------------