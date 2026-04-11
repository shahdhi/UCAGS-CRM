const { getGmailClient } = require('../config/google');

// Email templates
const templates = {
  acknowledgement: (name) => ({
    subject: 'Thank you for your enquiry - UCAGS',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Thank you for your interest in UCAGS!</h2>
        <p>Dear ${name},</p>
        <p>We have received your enquiry and one of our admissions officers will be in touch with you shortly.</p>
        <p>At Universal College of Applied & General Studies (UCAGS), we offer globally recognized diploma programs designed to help you achieve your educational and career goals.</p>
        <p>If you have any immediate questions, please don't hesitate to contact us.</p>
        <br>
        <p><strong>Contact Information:</strong></p>
        <p>
          Email: admissions@ucags.edu.lk<br>
          Website: <a href="https://ucags.edu.lk">https://ucags.edu.lk</a>
        </p>
        <br>
        <p>Best regards,</p>
        <p><strong>UCAGS Admissions Team</strong></p>
      </div>
    `
  }),
  
  followUp: (name, course, officerName) => ({
    subject: 'Following up on your UCAGS enquiry',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Following up on your enquiry</h2>
        <p>Dear ${name},</p>
        <p>I hope this email finds you well. I wanted to follow up on your enquiry about ${course || 'our programs'}.</p>
        <p>Do you have any questions about the program, admission requirements, or the enrollment process?</p>
        <p>I'm here to help guide you through the application process and answer any questions you may have.</p>
        <p>Please feel free to reach out at any time.</p>
        <br>
        <p>Best regards,</p>
        <p><strong>${officerName}</strong><br>
        Academic Advisor<br>
        UCAGS - Universal College of Applied & General Studies</p>
      </div>
    `
  }),
  
  registration: (name, course) => ({
    subject: 'Registration Information - UCAGS',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Registration Information</h2>
        <p>Dear ${name},</p>
        <p>Thank you for your interest in enrolling in ${course || 'our programs'} at UCAGS!</p>
        <p>To complete your registration, please follow these steps:</p>
        <ol>
          <li>Complete the online application form on our website</li>
          <li>Submit required documents (academic transcripts, ID copy, etc.)</li>
          <li>Pay the registration fee</li>
          <li>Attend the orientation session</li>
        </ol>
        <p>For detailed registration instructions, please visit: <a href="https://ucags.edu.lk">https://ucags.edu.lk</a></p>
        <p>If you need any assistance, please don't hesitate to contact us.</p>
        <br>
        <p>Best regards,</p>
        <p><strong>UCAGS Admissions Team</strong></p>
      </div>
    `
  })
};

// Create email message for Gmail API
function createMessage(to, subject, html) {
  const message = [
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `To: ${to}`,
    `Subject: ${subject}`,
    '',
    html
  ].join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return encodedMessage;
}

// Send acknowledgement email
async function sendAcknowledgement(to, name) {
  try {
    const gmail = await getGmailClient();
    const template = templates.acknowledgement(name);
    const encodedMessage = createMessage(to, template.subject, template.html);

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log(`Acknowledgement email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('Error sending acknowledgement email:', error);
    throw error;
  }
}

// Send follow-up email
async function sendFollowUp(to, name, course, officerName) {
  try {
    const gmail = await getGmailClient();
    const template = templates.followUp(name, course, officerName);
    const encodedMessage = createMessage(to, template.subject, template.html);

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log(`Follow-up email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('Error sending follow-up email:', error);
    throw error;
  }
}

// Send registration email
async function sendRegistrationInfo(to, name, course) {
  try {
    const gmail = await getGmailClient();
    const template = templates.registration(name, course);
    const encodedMessage = createMessage(to, template.subject, template.html);

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log(`Registration email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('Error sending registration email:', error);
    throw error;
  }
}

// Send custom email
async function sendCustomEmail(to, subject, message) {
  try {
    const gmail = await getGmailClient();
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        ${message}
        <br><br>
        <p>Best regards,</p>
        <p><strong>UCAGS Admissions Team</strong></p>
      </div>
    `;
    const encodedMessage = createMessage(to, subject, html);

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log(`Custom email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('Error sending custom email:', error);
    throw error;
  }
}

module.exports = {
  sendAcknowledgement,
  sendFollowUp,
  sendRegistrationInfo,
  sendCustomEmail
};
