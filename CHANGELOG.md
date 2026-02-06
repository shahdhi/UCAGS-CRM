# Changelog

All notable changes to the UCAGS CRM project will be documented in this file.

## [1.0.0] - 2026-01-21

### Initial Release

#### Features
- **Authentication System**
  - Session-based authentication
  - Role-based access control (Admin, Officer)
  - Bcrypt password hashing
  - Automatic officer credential refresh

- **Enquiry Management**
  - Create, read, update enquiries
  - Automatic assignment to officers (round-robin)
  - Status tracking (New, Contacted, Follow-up, Registered, Closed)
  - Advanced search and filtering
  - Note-taking system
  - Follow-up date scheduling

- **Dashboard & Analytics**
  - Real-time statistics
  - Status distribution charts
  - Source tracking
  - Officer performance metrics
  - Recent enquiries view
  - Upcoming follow-ups tracking

- **Email Integration**
  - Gmail API integration
  - Automated acknowledgement emails
  - Follow-up email templates
  - Registration information emails
  - Custom email support

- **Calendar Integration**
  - Google Calendar API integration
  - Automatic event creation for follow-ups
  - Email and popup reminders
  - Visual calendar view

- **Google Sheets Integration**
  - Google Sheets as primary database
  - Admin sheet for all enquiries
  - Individual officer sheets
  - Automatic synchronization
  - Real-time updates

- **Google Apps Script Automation**
  - Automatic enquiry assignment (every 10 minutes)
  - Daily follow-up reminders
  - Hourly sheet synchronization
  - Weekly performance reports
  - Webhook support for external submissions

- **User Interface**
  - Responsive design (mobile-friendly)
  - Clean, professional interface
  - Real-time search and filtering
  - Modal-based enquiry details
  - Status badges with color coding
  - Toast notifications

- **Optional Features**
  - Twilio integration for calls
  - Click-to-call support (tel: links)
  - Call logging

#### Documentation
- Comprehensive README
- Detailed setup guide (SETUP.md)
- Production deployment guide (DEPLOYMENT.md)
- Complete API documentation (API.md)
- Quick start guide (QUICKSTART.md)

#### Helper Scripts
- Password hash generator
- Connection tester
- Automated sheet setup
- Google Apps Script template

#### Security
- Environment variable protection
- Session security
- Password hashing
- HTTPS support
- CORS configuration
- Rate limiting ready

### Technical Stack
- Node.js v18+ with Express
- Google APIs (Sheets, Gmail, Calendar)
- Vanilla JavaScript frontend
- Google Apps Script automation
- Bcrypt for password hashing
- Session-based authentication

---

## Future Enhancements (Planned)

### Version 1.1.0
- [ ] Email templates customization UI
- [ ] Bulk operations (import/export)
- [ ] Advanced reporting dashboard
- [ ] SMS notifications (via Twilio)
- [ ] Document upload support
- [ ] Student portal

### Version 1.2.0
- [ ] Mobile application
- [ ] WhatsApp integration
- [ ] AI-powered lead scoring
- [ ] Automated chatbot
- [ ] Video call integration
- [ ] Multi-language support

---

For version history and release notes, visit: https://github.com/ucags/crm/releases
