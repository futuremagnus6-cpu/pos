const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

let transporter;

// Initialize email transporter
const initializeTransporter = () => {
  if (transporter) return transporter;

  const missing = [];
  if (!config.email.host) missing.push('SMTP_HOST');
  if (!config.email.user) missing.push('SMTP_USER');
  if (!config.email.pass) missing.push('SMTP_PASS');

  if (missing.length > 0) {
    logger.warn(`Email configuration is incomplete. Missing: ${missing.join(', ')}. Email sending will be disabled.`);
    return null;
  }

  logger.info(`Initializing email transporter with host: ${config.email.host}, user: ${config.email.user}`);

  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
    // Add TLS options for Gmail compatibility
    tls: {
      rejectUnauthorized: false
    }
  });

  // Verify connection configuration
  transporter.verify((error) => {
    if (error) {
      logger.error(`Email transporter verification failed: ${error.message}`);
      logger.error('This may be due to incorrect SMTP credentials. Check your .env file.');
    } else {
      logger.info('Email transporter is ready to send emails');
    }
  });

  return transporter;
};

// Send email
const sendEmail = async (to, subject, htmlContent, textContent = '') => {
  try {
    const emailTransporter = initializeTransporter();

    if (!emailTransporter) {
      logger.warn(`Email service not configured. Would have sent: ${subject} to ${to}`);
      return { success: false, message: 'Email service not configured' };
    }

    const mailOptions = {
      from: config.email.from,
      to,
      subject,
      html: htmlContent,
      text: textContent || subject,
    };

    const info = await emailTransporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId} to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // Provide more specific error messages for common issues
    let errorMessage = error.message;
    if (error.code === 'EAUTH' || error.response?.includes('535') || error.response?.includes('Username and Password not accepted')) {
      errorMessage = 'Email authentication failed. Please check your SMTP credentials in .env file. For Gmail, you need to use an App Password, not your regular password.';
    }

    logger.error(`Failed to send email to ${to}: ${errorMessage}`);
    return { success: false, message: errorMessage };
  }
};

// Send password reset email to shop admin
const sendPasswordResetEmail = async (adminEmail, adminName, resetToken, shopName) => {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        .warning { color: #dc2626; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello <strong>${adminName}</strong>,</p>
          <p>A password reset request has been initiated by the Super Admin for your shop account.</p>
          <p><strong>Shop Name:</strong> ${shopName}</p>
          <p>Click the button below to set your new password. This link will expire in 1 hour.</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          <p>Or copy and paste this URL in your browser:</p>
          <p style="background-color: #f0f0f0; padding: 10px; border-radius: 3px; word-break: break-all;">
            ${resetUrl}
          </p>
          <p class="warning">
            ⚠️ <strong>Important:</strong> If you did not request a password reset, please contact your Super Admin immediately. Do not share this link with anyone.
          </p>
        </div>
        <div class="footer">
          <p>© 2024 FutureMagnus. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this address.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Password Reset Request

Hello ${adminName},

A password reset request has been initiated by the Super Admin for your shop account.

Shop Name: ${shopName}

Click the link below to set your new password. This link will expire in 1 hour.

${resetUrl}

If you did not request a password reset, please contact your Super Admin immediately.

---
© 2024 FutureMagnus. All rights reserved.
This is an automated email. Please do not reply to this address.
  `;

  return sendEmail(
    adminEmail,
    `Password Reset Request - ${shopName}`,
    htmlContent,
    textContent
  );
};

// Send welcome email with temporary password
const sendWelcomeEmail = async (adminEmail, adminName, shopName, temporaryPassword) => {
  const loginUrl = `${config.frontendUrl}/login`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .credentials { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to FutureMagnus</h1>
        </div>
        <div class="content">
          <p>Hello <strong>${adminName}</strong>,</p>
          <p>Your shop account has been successfully created in FutureMagnus!</p>
          <p><strong>Shop Name:</strong> ${shopName}</p>
          
          <div class="credentials">
            <p><strong>Login Credentials:</strong></p>
            <p>Email: <code>${adminEmail}</code></p>
            <p>Temporary Password: <code>${temporaryPassword}</code></p>
          </div>

          <p>Click the button below to login and get started:</p>
          <div style="text-align: center;">
            <a href="${loginUrl}" class="button">Login Now</a>
          </div>

          <p><strong>Next Steps:</strong></p>
          <ol>
            <li>Log in with the credentials above</li>
            <li>Change your password immediately</li>
            <li>Set up your shop profile and preferences</li>
            <li>Start managing your business</li>
          </ol>
        </div>
        <div class="footer">
          <p>© 2024 FutureMagnus. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this address.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(
    adminEmail,
    `Welcome to FutureMagnus - ${shopName}`,
    htmlContent
  );
};

// Send payment confirmation email
const sendPaymentConfirmationEmail = async (adminEmail, adminName, shopName, planName, amount, paymentId, validUntil) => {
  const dashboardUrl = `${config.frontendUrl}/billing`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .details { background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #dcfce7; }
        .button { display: inline-block; background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Payment Successful! 🎉</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${adminName}</strong>,</p>
          <p>Your payment has been successfully processed for <strong>${shopName}</strong>.</p>
          
          <div class="details">
            <h3 style="margin-top: 0; color: #059669;">Payment Details</h3>
            <div class="detail-row">
              <span>Plan</span>
              <strong>${planName}</strong>
            </div>
            <div class="detail-row">
              <span>Amount Paid</span>
              <strong>₹${amount}</strong>
            </div>
            <div class="detail-row">
              <span>Payment ID</span>
              <strong>${paymentId}</strong>
            </div>
            <div class="detail-row" style="border-bottom: none;">
              <span>Valid Until</span>
              <strong>${validUntil}</strong>
            </div>
          </div>

          <p>Your subscription is now active and you have access to all features of your plan.</p>

          <div style="text-align: center;">
            <a href="${dashboardUrl}" class="button">View Billing Details</a>
          </div>
        </div>
        <div class="footer">
          <p>© 2024 FutureMagnus. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this address.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(
    adminEmail,
    `Payment Successful - ${planName} Plan Activated for ${shopName}`,
    htmlContent
  );
};

// Send subscription expiry warning email
const sendSubscriptionExpiryWarning = async (adminEmail, adminName, shopName, planName, expiryDate, daysRemaining) => {
  const billingUrl = `${config.frontendUrl}/billing`;
  
  const isCritical = daysRemaining <= 3;
  const headerBg = isCritical ? '#dc2626' : '#f59e0b';
  const headerTitle = isCritical ? '⚠️ Subscription Expiring Soon!' : 'Subscription Renewal Reminder';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${headerBg}; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .warning-banner { background-color: ${isCritical ? '#fef2f2' : '#fffbeb'}; border-left: 4px solid ${headerBg}; padding: 15px; margin: 20px 0; }
        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${headerTitle}</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${adminName}</strong>,</p>
          <p>This is a reminder regarding your subscription for <strong>${shopName}</strong>.</p>
          
          <div class="warning-banner">
            <p style="margin: 0;"><strong>${isCritical ? '⚠️ Action Required!' : '📅 Reminder'}</strong></p>
            <p style="margin: 5px 0 0 0;">
              ${isCritical
                ? 'Your subscription will expire in less than 3 days. Please renew immediately to avoid service interruption.'
                : `Your subscription will expire in ${daysRemaining} days. Please renew to continue uninterrupted service.`
              }
            </p>
          </div>

          <p><strong>Subscription Details:</strong></p>
          <p>Plan: ${planName || 'Current Plan'}</p>
          <p>Expiry Date: ${expiryDate}</p>
          <p>Days Remaining: <strong>${daysRemaining}</strong></p>

          <div style="text-align: center;">
            <a href="${billingUrl}" class="button">Renew Subscription</a>
          </div>
          
          <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
            ${isCritical ? '⚠️ Failure to renew may result in temporary suspension of your account.' : ''}
          </p>
        </div>
        <div class="footer">
          <p>© 2024 FutureMagnus. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this address.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(
    adminEmail,
    `${isCritical ? '⚠️ Urgent: ' : ''}Subscription Expiry Reminder - ${shopName}`,
    htmlContent
  );
};

// Send employee credentials email
const sendEmployeeCredentialsEmail = async (employeeEmail, employeeName, shopName, loginEmail, temporaryPassword, role) => {
  const loginUrl = `${config.frontendUrl}/login`;
  
  const roleLabel = role === 'manager' ? 'Manager' : 'Staff';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .credentials { background-color: #f5f3ff; padding: 15px; border-left: 4px solid #7c3aed; margin: 20px 0; }
        .button { display: inline-block; background-color: #7c3aed; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to ${shopName}! 🎉</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${employeeName}</strong>,</p>
          <p>You have been added as a <strong>${roleLabel}</strong> at <strong>${shopName}</strong> on FutureMagnus.</p>
          
          <div class="credentials">
            <p><strong>Your Login Credentials:</strong></p>
            <p>Email: <code>${loginEmail}</code></p>
            <p>Temporary Password: <code>${temporaryPassword}</code></p>
            <p>Role: <strong>${roleLabel}</strong></p>
          </div>

          <p>Click the button below to login and get started:</p>
          <div style="text-align: center;">
            <a href="${loginUrl}" class="button">Login to Your Account</a>
          </div>

          <p><strong>Important:</strong></p>
          <ul>
            <li>Please change your password after first login</li>
            <li>Your access is limited based on your ${roleLabel} role permissions</li>
            <li>Contact your shop administrator if you need any assistance</li>
          </ul>
        </div>
        <div class="footer">
          <p>© 2024 FutureMagnus. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this address.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(
    employeeEmail,
    `Welcome to ${shopName} - Your Account Credentials`,
    htmlContent
  );
};

// Send trial expiry warning email
const sendTrialExpiryWarning = async (adminEmail, adminName, shopName, trialEndDate, daysRemaining) => {
  const billingUrl = `${config.frontendUrl}/billing`;
  
  const isCritical = daysRemaining <= 2;
  const headerBg = isCritical ? '#dc2626' : '#f59e0b';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${headerBg}; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .trial-banner { background-color: ${isCritical ? '#fef2f2' : '#fffbeb'}; border-left: 4px solid ${headerBg}; padding: 15px; margin: 20px 0; }
        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${isCritical ? '⚠️ Trial Ending Soon!' : 'Free Trial Reminder'}</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${adminName}</strong>,</p>
          <p>Your free trial for <strong>${shopName}</strong> is ending soon.</p>
          
          <div class="trial-banner">
            <p style="margin: 0;"><strong>Trial Ends:</strong> ${trialEndDate}</p>
            <p style="margin: 5px 0 0 0;"><strong>Days Remaining:</strong> ${daysRemaining}</p>
          </div>

          <p>Choose a subscription plan to continue using FutureMagnus without any interruption. We offer flexible plans to suit your business needs.</p>

          <div style="text-align: center;">
            <a href="${billingUrl}" class="button">Choose a Plan</a>
          </div>
          
          <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
            Your data will be preserved even after the trial ends. Simply subscribe to regain access.
          </p>
        </div>
        <div class="footer">
          <p>© 2024 FutureMagnus. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this address.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(
    adminEmail,
    `${isCritical ? '⚠️ Urgent: ' : ''}Free Trial Ending - ${shopName}`,
    htmlContent
  );
};

// Send email to trial user prompting them to complete purchase / subscribe
const sendCompleteTrialEmail = async (adminEmail, adminName, shopName, planName, planPrice) => {
  const billingUrl = `${config.frontendUrl}/billing`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .plan-card { background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
        .price { font-size: 28px; font-weight: bold; color: #2563eb; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Your Free Trial is Ready! 🚀</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${adminName}</strong>,</p>
          <p>Your shop <strong>${shopName}</strong> has been created and is currently on a free trial.</p>
          
          <p>To continue using FutureMagnus after your trial ends, please choose a subscription plan and complete your payment.</p>

          <div class="plan-card">
            <p style="margin: 0 0 5px 0; color: #6b7280;">Recommended Plan</p>
            <p style="margin: 0 0 5px 0; font-size: 18px; font-weight: 600;">${planName}</p>
            <p class="price">₹${planPrice}<span style="font-size: 14px; font-weight: normal; color: #6b7280;">/month</span></p>
          </div>

          <p><strong>Benefits of subscribing:</strong></p>
          <ul>
            <li>Uninterrupted access to all features</li>
            <li>Priority support</li>
            <li>Regular updates & new features</li>
            <li>Secure data backups</li>
          </ul>

          <div style="text-align: center;">
            <a href="${billingUrl}" class="button">Choose Your Plan & Subscribe</a>
          </div>
          
          <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
            Your data is safe. If you have any questions, reply to this email or contact our support team.
          </p>
        </div>
        <div class="footer">
          <p>© 2024 FutureMagnus. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this address.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(
    adminEmail,
    `Complete Your Subscription - ${shopName}`,
    htmlContent
  );
};

const sendBillingNotificationEmail = async (adminEmail, adminName, title, subject, message) => {
  const billingUrl = `${config.frontendUrl}/billing`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #2563eb; color: white; padding: 18px; border-radius: 6px 6px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">${title}</h1>
        </div>
        <div style="background-color: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
          <p>Hello <strong>${adminName}</strong>,</p>
          <p>${message}</p>
          <p style="text-align: center; margin-top: 24px;">
            <a href="${billingUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;">Open Billing</a>
          </p>
        </div>
        <div style="background-color:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
          This is an automated billing notification.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(adminEmail, subject, htmlContent, `${title}\n\n${message}\n\n${billingUrl}`);
};

// Send invoice email to customer with PDF attachment
const sendCustomerInvoiceEmail = async (customerEmail, customerName, order, invoiceData) => {
  const shopName = invoiceData?.shopName || 'Your Shop';
  const ordersUrl = `${config.frontendUrl}/orders`;

  const itemRows = (order.items || []).map(item =>
    `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${item.productName}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(item.sellingPrice || 0).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(item.total || 0).toFixed(2)}</td></tr>`
  ).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .order-info { background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .button { display: inline-block; background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background-color: #065f46; color: white; padding: 10px; text-align: left; font-size: 12px; }
        th:last-child { text-align: right; }
        .total-row { font-size: 16px; font-weight: bold; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Thank You for Your Purchase! 🎉</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${customerName || 'Valued Customer'}</strong>,</p>
          <p>Thank you for shopping at <strong>${shopName}</strong>! Your invoice is attached with this email.</p>

          <div class="order-info">
            <p><strong>Order Number:</strong> ${order.orderNumber || ''}</p>
            <p><strong>Invoice Number:</strong> ${order.invoiceNumber || ''}</p>
            <p><strong>Date:</strong> ${order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : ''}</p>
          </div>

          <table>
            <tr><th>Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Total</th></tr>
            ${itemRows}
          </table>

          <div style="text-align:right;margin-top:10px;">
            <p>Subtotal: ₹${(order.subtotal || 0).toFixed(2)}</p>
            ${order.totalDiscount > 0 ? `<p>Discount: -₹${(order.totalDiscount || 0).toFixed(2)}</p>` : ''}
            <p>GST: ₹${(order.totalGst || 0).toFixed(2)}</p>
            <p class="total-row" style="font-size:18px;">Grand Total: ₹${(order.grandTotal || 0).toFixed(2)}</p>
          </div>

          <div style="text-align:center;">
            <a href="${ordersUrl}" class="button">View Your Orders</a>
          </div>

          <p style="font-size:12px;color:#6b7280;margin-top:20px;">
            The detailed invoice PDF is attached to this email. Please save it for your records.
          </p>
        </div>
        <div class="footer">
          <p>© 2024 FutureMagnus. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this address.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const emailTransporter = initializeTransporter();
    if (!emailTransporter) {
      logger.warn('Email service not configured. Would have sent invoice to ' + customerEmail);
      return { success: false, message: 'Email service not configured' };
    }

    const attachments = [];
    if (invoiceData?.filePath && fs.existsSync(invoiceData.filePath)) {
      attachments.push({
        filename: invoiceData.fileName || `invoice-${order.orderNumber}.pdf`,
        path: invoiceData.filePath,
      });
    }

    const mailOptions = {
      from: config.email.from,
      to: customerEmail,
      subject: `Your Invoice from ${shopName} - ${order.invoiceNumber || order.orderNumber}`,
      html: htmlContent,
      attachments,
    };

    const info = await emailTransporter.sendMail(mailOptions);
    logger.info(`Invoice email sent: ${info.messageId} to ${customerEmail}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send invoice email to ${customerEmail}: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Send purchase order notification to supplier
const sendSupplierPurchaseEmail = async (supplierEmail, supplierName, shopName, purchase, type = 'created') => {
  const isReceived = type === 'received';

  const itemRows = (purchase.items || []).map(item =>
    `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${item.productName}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(item.unitPrice || 0).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(item.total || 0).toFixed(2)}</td></tr>`
  ).join('');

  const headerColor = isReceived ? '#059669' : '#2563eb';
  const title = isReceived ? 'Purchase Order Received ✅' : 'New Purchase Order 📋';
  const subject = isReceived
    ? `Purchase Order Received - ${purchase.purchaseOrderNumber}`
    : `New Purchase Order - ${purchase.purchaseOrderNumber}`;
  const message = isReceived
    ? 'We have received the following items from you. Thank you for the supply!'
    : 'A new purchase order has been created. Please process the following items.';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${headerColor}; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .info { background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background-color: ${headerColor}; color: white; padding: 10px; text-align: left; font-size: 12px; }
        th:last-child { text-align: right; }
        .total-row { font-size: 16px; font-weight: bold; }
        .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${supplierName || 'Supplier'}</strong>,</p>
          <p>${message}</p>

          <div class="info">
            <p><strong>Shop:</strong> ${shopName}</p>
            <p><strong>PO Number:</strong> ${purchase.purchaseOrderNumber || ''}</p>
            ${purchase.invoiceNumber ? `<p><strong>Invoice:</strong> ${purchase.invoiceNumber}</p>` : ''}
            <p><strong>Date:</strong> ${purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-IN') : ''}</p>
            ${isReceived && purchase.grnNumber ? `<p><strong>GRN:</strong> ${purchase.grnNumber}</p>` : ''}
          </div>

          <table>
            <tr><th>Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Total</th></tr>
            ${itemRows}
          </table>

          <div style="text-align:right;margin-top:10px;">
            <p>Subtotal: ₹${(purchase.subtotal || 0).toFixed(2)}</p>
            <p>GST: ₹${(purchase.totalGst || 0).toFixed(2)}</p>
            <p class="total-row">Grand Total: ₹${(purchase.grandTotal || 0).toFixed(2)}</p>
          </div>

          ${purchase.notes ? `<p style="margin-top:20px;padding:10px;background:#fffbeb;border-left:3px solid #f59e0b;font-size:12px;"><strong>Notes:</strong> ${purchase.notes}</p>` : ''}
        </div>
        <div class="footer">
          <p>Thank you for your business partnership!</p>
          <p>© 2024 FutureMagnus. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(
    supplierEmail,
    `${subject} - ${shopName}`,
    htmlContent
  );
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendSubscriptionExpiryWarning,
  sendEmployeeCredentialsEmail,
  sendTrialExpiryWarning,
  sendCompleteTrialEmail,
  sendBillingNotificationEmail,
  sendCustomerInvoiceEmail,
  sendSupplierPurchaseEmail,
  initializeTransporter,
};
