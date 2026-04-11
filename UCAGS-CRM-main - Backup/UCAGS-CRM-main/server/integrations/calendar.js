const { getCalendarClient } = require('../config/google');

// Create calendar event for follow-up
async function createFollowUpEvent(enquiry, followUpDate, notes) {
  try {
    const calendar = await getCalendarClient();
    
    const eventStartTime = new Date(followUpDate);
    const eventEndTime = new Date(eventStartTime.getTime() + 30 * 60000); // 30 minutes

    const event = {
      summary: `Follow-up: ${enquiry.fullName}`,
      description: `
        Student Enquiry Follow-up
        
        Name: ${enquiry.fullName}
        Email: ${enquiry.email}
        Phone: ${enquiry.phone}
        Course: ${enquiry.course}
        Status: ${enquiry.status}
        
        Notes: ${notes || enquiry.notes || 'No notes'}
        
        Enquiry ID: ${enquiry.enquiryId}
      `,
      start: {
        dateTime: eventStartTime.toISOString(),
        timeZone: 'Asia/Colombo'
      },
      end: {
        dateTime: eventEndTime.toISOString(),
        timeZone: 'Asia/Colombo'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 30 }
        ]
      },
      colorId: '9' // Blue color
    };

    const response = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID || 'primary',
      requestBody: event
    });

    console.log(`Calendar event created for enquiry ${enquiry.enquiryId}`);
    return {
      success: true,
      eventId: response.data.id,
      eventLink: response.data.htmlLink
    };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
}

// Get upcoming follow-ups
async function getUpcomingFollowUps(daysAhead = 7) {
  try {
    const calendar = await getCalendarClient();
    
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const response = await calendar.events.list({
      calendarId: process.env.CALENDAR_ID || 'primary',
      timeMin: now.toISOString(),
      timeMax: futureDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      q: 'Follow-up'
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Error fetching upcoming follow-ups:', error);
    throw error;
  }
}

// Update calendar event
async function updateFollowUpEvent(eventId, updates) {
  try {
    const calendar = await getCalendarClient();
    
    const event = await calendar.events.get({
      calendarId: process.env.CALENDAR_ID || 'primary',
      eventId: eventId
    });

    const updatedEvent = {
      ...event.data,
      ...updates
    };

    const response = await calendar.events.update({
      calendarId: process.env.CALENDAR_ID || 'primary',
      eventId: eventId,
      requestBody: updatedEvent
    });

    return {
      success: true,
      eventId: response.data.id
    };
  } catch (error) {
    console.error('Error updating calendar event:', error);
    throw error;
  }
}

// Delete calendar event
async function deleteFollowUpEvent(eventId) {
  try {
    const calendar = await getCalendarClient();
    
    await calendar.events.delete({
      calendarId: process.env.CALENDAR_ID || 'primary',
      eventId: eventId
    });

    return { success: true };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    throw error;
  }
}

module.exports = {
  createFollowUpEvent,
  getUpcomingFollowUps,
  updateFollowUpEvent,
  deleteFollowUpEvent
};
