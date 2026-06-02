/** Privacy policy copy — single source for in-app Privacy Policy screen. */

export const PRIVACY_POLICY_LAST_UPDATED = "January 2026";

export const PRIVACY_POLICY_SECTIONS = [
  {
    number: 1,
    title: "INTRODUCTION",
    paragraphs: [
      "This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our health and wellness management application. By using this app, you agree to the terms described in this policy.",
      "We are committed to protecting your privacy and ensuring your personal data is handled with the highest level of security and responsibility.",
    ],
  },
  {
    number: 2,
    title: "INFORMATION WE COLLECT",
    subsections: [
      {
        label: "2.1 Personal Information:",
        bullets: [
          "Full name, email address, phone number",
          "Profile photo (optional)",
          "Date of birth and gender",
          "Location data (city/region only)",
        ],
      },
      {
        label: "2.2 Health and Medical Information:",
        bullets: [
          "Medical history and health conditions",
          "Dietary information and food photos",
          "Weight, height, and body measurements",
          "Health goals and progress data",
        ],
      },
      {
        label: "2.3 Communication Data:",
        bullets: [
          "Messages sent between users in chat",
          "Files, photos, videos, and documents shared via chat or folders",
          "Complaint tickets submitted to admin",
        ],
      },
      {
        label: "2.4 Technical Data:",
        bullets: [
          "Device type and operating system",
          "App version and usage patterns",
          "Login timestamps and session data",
          "Push notification tokens",
        ],
      },
    ],
  },
  {
    number: 3,
    title: "HOW WE USE YOUR INFORMATION",
    intro: "We use your information to:",
    bullets: [
      "Provide and manage your account",
      "Connect you with your assigned health professional",
      "Enable communication between clients and employees",
      "Track dietary and health progress",
      "Generate health and progress reports",
      "Send relevant notifications",
      "Improve app performance and features",
      "Ensure security of all accounts",
      "Comply with legal obligations",
    ],
    outro: "We do NOT use your information for:",
    bulletsAfter: [
      "Selling to third parties",
      "Targeted advertising",
      "Any purpose not stated in this policy",
    ],
  },
  {
    number: 4,
    title: "HOW WE STORE YOUR DATA",
    subsections: [
      {
        label: "4.1 Storage:",
        bullets: [
          "Your data is stored securely on MongoDB database servers",
          "Media files are stored on Amazon S3 secure cloud storage",
          "All data is encrypted at rest and in transit",
        ],
      },
      {
        label: "4.2 Retention:",
        bullets: [
          "Your data is kept as long as your account is active",
          "If your account is deactivated, data is retained for 90 days then permanently deleted",
          "You may request deletion at any time by contacting support",
        ],
      },
      {
        label: "4.3 Security:",
        bullets: [
          "All communications are encrypted using SSL/TLS",
          "Passwords are hashed and never stored in plain text",
          "Single session enforcement — your account cannot be logged into on multiple devices simultaneously",
          "Regular security audits are performed",
        ],
      },
    ],
  },
  {
    number: 5,
    title: "WHO CAN SEE YOUR DATA",
    subsections: [
      {
        label: "5.1 Admin:",
        bullets: [
          "Can view all user profiles and account information",
          "Can view reports and health data",
          "Can monitor employee-client communications for quality assurance",
          "Cannot read private chat messages except through monitoring tools",
        ],
      },
      {
        label: "5.2 Assigned Employee:",
        bullets: [
          "Can view your profile and medical information",
          "Can view your diet log and progress photos",
          "Can communicate with you via chat",
          "Cannot access other clients' data",
        ],
      },
      {
        label: "5.3 Other Clients:",
        bullets: [
          "Cannot see your data at all",
          "No cross-client data access",
        ],
      },
      {
        label: "5.4 Third Parties:",
        bullets: [
          "We do not share your data with any third parties",
          "Exception: cloud infrastructure providers (MongoDB, AWS S3) who are bound by strict data processing agreements",
        ],
      },
    ],
  },
  {
    number: 6,
    title: "MEDIA AND FILES",
    bullets: [
      "Photos and videos you upload are stored securely",
      "Diet photos are only visible to you and your assigned employee",
      "Files shared in folders are only visible to users granted access by admin or employee",
      "Chat media is only visible to participants of that conversation",
      "You can request deletion of your media at any time",
    ],
  },
  {
    number: 7,
    title: "NOTIFICATIONS",
    bulletGroups: [
      {
        intro: "We send push notifications for:",
        bullets: ["New chat messages", "System updates", "Important account alerts"],
      },
    ],
    bullets: [
      "Notifications stop immediately upon logout",
      "You can disable notifications in your device settings",
    ],
  },
  {
    number: 8,
    title: "YOUR RIGHTS",
    intro: "You have the right to:",
    bullets: [
      "Access all data we hold about you",
      "Request correction of incorrect data",
      "Request deletion of your account and all associated data",
      "Withdraw consent at any time",
      "Raise a complaint via the in-app complaints system",
    ],
    paragraphs: [
      "To exercise any of these rights, use the Contact Support option in the About section or raise a complaint through the app.",
    ],
  },
  {
    number: 9,
    title: "CHILDREN'S PRIVACY",
    paragraphs: [
      "This app is not intended for use by anyone under the age of 16. We do not knowingly collect personal information from children under 16. If you believe a child has provided us with personal information, please contact us immediately.",
    ],
  },
  {
    number: 10,
    title: "CHANGES TO THIS POLICY",
    intro: "We may update this Privacy Policy from time to time. When we do:",
    bullets: [
      'The "Last updated" date will change',
      "You will be notified via the app",
      "Continued use of the app means you accept the updated policy",
    ],
  },
  {
    number: 11,
    title: "CONTACT",
    paragraphs: [
      "If you have any questions about this Privacy Policy or how we handle your data, please contact us through:",
    ],
    bullets: [
      "The Contact Support option in the About section of the app",
      "The Complaints section in the app",
    ],
  },
];

export const PRIVACY_POLICY_FOOTER = {
  credit: "Designed and Developed by Vijay Anuganti",
  copyright: "© 2026 All rights reserved.",
};
