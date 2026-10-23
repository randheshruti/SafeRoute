# SafeRoute – Smart and Safe Route Recommendation System

## About the Project
SafeRoute is a web-based application designed to help users plan routes and access safety-related information. It provides features such as route planning, safe places, emergency contacts, SOS record management, incident reporting, and alerts.

## Objectives
- Help users plan routes between locations.
- Provide information about available safe places.
- Allow users to submit SOS records and report incidents.
- Provide emergency contact information and safety alerts.
- Help administrators manage users and review incident reports.

## Technologies Used
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python, Flask
- **Database:** MySQL
- **Tools:** Visual Studio Code, MySQL Workbench, Git, GitHub
- **Routing:** OpenStreetMap services and OSRM, where configured

## Main Modules
1. User Registration and Login
2. Dashboard
3. Route Planning
4. Safe Places
5. Emergency Contacts
6. SOS Management
7. Incident Reporting
8. Alerts
9. Feedback
10. Admin Management

## Project Structure
```text
NEW SAFEROUTE/
├── app.py
├── config.py
├── db.py
├── requirements.txt
├── templates/
├── static/
└── README.md
```

## Installation and Setup
1. Install Python and MySQL.
2. Clone or download the project.
3. Open the project folder in Visual Studio Code.
4. Install the required Python packages:

   ```bash
   pip install -r requirements.txt
   ```

5. Configure the MySQL database and connection settings.
6. Run the Flask application:

   ```bash
   python app.py
   ```

7. Open the local URL displayed in the terminal in your web browser.

## Future Enhancements
- Real-time safety alerts.
- Integration with emergency services.
- Live location tracking.
- Improved risk analysis and safe-route recommendations.

## Note
The availability of features depends on the current implementation and configuration. SOS records and stored alerts do not automatically contact emergency services or guarantee real-time safety.

## Author
Shruti Randhe

## License
This project is developed for educational purposes.
