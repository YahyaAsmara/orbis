# Orbis - Fictional World Navigation System

A web-based navigation system for fictional worlds, inspired by Google Maps but designed for creative worldbuilding and fantasy settings.

## Overview

Orbis allows users to create custom locations, landmarks, and road networks within an imaginary world, then calculate optimal routes between destinations based on time of day, transport mode, and desired pit stops.

## Key Features

- **User Accounts**: Personalized profiles with custom map extensions
- **Location Management**: Create locations with detailed attributes (capacity, parking, accessibility)
- **Landmarks**: Define points of interest within locations
- **Road Networks**: Design interconnected paths between locations
- **Multi-Modal Transport**: Various transport types with unique speed and cost characteristics
- **Route Planning**: Real-time distance, time, and cost calculations
- **Time Restrictions**: Road usage limitations based on time of day and transport type
- **Multi-Currency Support**: Location-based transactions with currency conversion

## Project Structure

```
root/
├── code/
│   ├── frontend/       # React SPA with leafletjs* map visualization
│   ├── backend/        # Flask API with SQLAlchemy -> PostgreSQL*
│   └── database/       # PostgreSQL* schemas and scripts
└── documentation/      # Project proposals, contracts, and reports
```
* Subject to change.

## Tech Stack

- **Backend**: Python + Flask with SQLAlchemy ORM
- **Frontend**: Typscript (HTML5, CSS3, JavaScript/React) with leafletjs for map visualization
- **Database**: PostgreSQL
- **Architecture**: Single Page Application (SPA) with RESTful API

## Admin Access & Account Management

- The first administrator must be promoted manually in the database. Run:

	```sql
	UPDATE USERS SET userRole = 'admin' WHERE username = 'your_username';
	```

	Replace `your_username` with an existing account. After one admin exists, use the in-app Admin dashboard to promote/demote other users or remove dormant accounts.

- Signed-in users can visit `/profile` to review their account, inspect stored locations/routes, and delete their account (which cascades to their locations and saved paths). Deleting an account signs the user out automatically.

## Team

**T03-7** - CPSC 471 Fall 2025
- Yahya Asmara -- 30205038 -- yahya.asmara@ucalgary.ca
- Abdulrahman Negmeldin -- 30204221 -- abdulrahman.negmeldi@ucalgary.ca
- Jason Duong -- 30204387 -- jason.duong@ucalgary.ca