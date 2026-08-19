export type LegalDocumentKey = 'privacy' | 'emergency' | 'terms' | 'data' | 'licenses';

export type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type LegalDocument = {
  title: string;
  updated: string;
  summary: string;
  sections: LegalSection[];
};

const updated = 'August 19, 2026';

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    updated,
    summary: 'This policy explains how Contact accesses, stores, uses, and shares information. Contact has no user accounts and no project-operated application backend.',
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [
          'Contact is published by Public Emergency Codes. Privacy questions may be sent to support@emergency.codes. Do not send medical details, recordings, passwords, or active-emergency information by email.',
        ],
      },
      {
        heading: 'Information the app may access',
        paragraphs: ['Only features you use and permissions you grant determine what Contact can access.'],
        bullets: [
          'Precise and background location, saved addresses, and location history.',
          'Contacts, phone numbers, SMS/MMS content, call state, and call history.',
          'Emergency profile information you enter, including medical information and an optional photo.',
          'Camera, microphone, photos, files, and emergency recordings.',
          'Notification state and device capabilities needed for calling, messaging, and safety features.',
        ],
      },
      {
        heading: 'How information is used',
        paragraphs: [
          'Contact uses this information to provide calling and messaging, emergency-location assistance, safety check-ins, saved contacts and addresses, recordings, accessibility features, and the emergency information you choose to provide.',
          'Contact does not sell personal information and does not use it for advertising or cross-app tracking.',
        ],
      },
      {
        heading: 'Storage and retention',
        paragraphs: [
          'Most app information is stored locally on your device. Emergency history is limited to the latest 50 records and records older than 90 days are scheduled for deletion. Location history is limited to the latest 500 points. Recordings remain until you delete them, clear app storage, or uninstall the app.',
          'Android, your carrier, recipients, emergency services, and external applications may separately retain calls, messages, attachments, or other information under their own policies.',
        ],
      },
      {
        heading: 'When information leaves your device',
        paragraphs: [
          'Information leaves the device only when a feature needs an external recipient or service—for example, placing a call, sending an SMS/MMS or attachment, opening a map or public-safety link, or loading map data.',
          'Depending on the feature, recipients may include people you select, telecommunications carriers, emergency-service providers, public-safety endpoints, OpenStreetMap-related services, ArcGIS services, or another app you explicitly choose. Those parties receive network metadata such as your IP address and may receive coordinates, search terms, messages, media, or profile details required by the action.',
        ],
      },
      {
        heading: 'Security and your choices',
        paragraphs: [
          'Contact relies on Android application isolation and modern encrypted HTTPS connections where supported by the destination. Ordinary telephone calls and carrier SMS/MMS are governed by carrier networks and are not end-to-end encrypted by Contact.',
          'You can deny permissions, disable features, delete recordings and saved items, clear the app’s storage in Android settings, or uninstall the app. See Data Management in About & Legal for details.',
        ],
      },
      {
        heading: 'Children and changes',
        paragraphs: [
          'Contact is not directed to children and does not knowingly operate an account service that collects children’s information. A parent or guardian should supervise use by a minor.',
          'This policy may change when app behavior or legal requirements change. The updated date shown on this page identifies the current bundled version.',
        ],
      },
    ],
  },
  emergency: {
    title: 'Emergency & Medical Disclaimer',
    updated,
    summary: 'Contact is an assistance tool, not an emergency service or medical device.',
    sections: [
      {
        heading: 'During an emergency',
        paragraphs: [
          'If you can, call the official emergency number for your location directly. In the United States, call 911. Do not delay contacting emergency services while configuring or troubleshooting this app.',
          'Never rely on Contact as your only way to request emergency assistance. Keep your device’s normal phone and messaging functions available.',
        ],
      },
      {
        heading: 'No government or dispatcher affiliation',
        paragraphs: [
          'Contact and Public Emergency Codes are not 911, a Public Safety Answering Point, a government agency, a telecommunications carrier, or an emergency-response organization. No affiliation, endorsement, monitoring, or guaranteed dispatcher integration is implied.',
        ],
      },
      {
        heading: 'No guaranteed delivery or availability',
        paragraphs: [
          'Calls, SMS/MMS, location, translation, maps, video, and public-safety integrations may be unavailable, delayed, inaccurate, unsupported, or rejected because of device state, permissions, battery, network or carrier conditions, local infrastructure, recipient capability, or third-party service availability.',
          'Text-to-911, multimedia, video, and automated data delivery are not supported by every jurisdiction or emergency center. Confirm critical information verbally with a dispatcher whenever possible.',
        ],
      },
      {
        heading: 'Medical disclaimer',
        paragraphs: [
          'Contact is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Information displayed or transmitted by the app is not medical advice.',
          'Consult a qualified healthcare professional for medical advice, diagnosis, or treatment. For an urgent or life-threatening situation, contact official emergency services immediately.',
        ],
      },
      {
        heading: 'Accuracy and testing',
        paragraphs: [
          'Review saved contacts, addresses, medical details, permissions, and device settings regularly. Location estimates and translations can be wrong. Never make an unauthorized test call or message to an emergency number.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Use',
    updated,
    summary: 'By using Contact, you agree to use it lawfully and understand its operational limits.',
    sections: [
      {
        heading: 'Permitted use',
        paragraphs: ['You may use Contact for lawful personal communication, safety, accessibility, and emergency-assistance purposes. You remain responsible for your device, carrier plan, recipients, information, and actions.'],
      },
      {
        heading: 'Prohibited use',
        paragraphs: ['Do not use Contact to make false emergency reports, harass or impersonate others, secretly record where prohibited, send unlawful messages, interfere with emergency services, or violate privacy, telecommunications, recording-consent, export, or other applicable laws.'],
      },
      {
        heading: 'Third-party services and charges',
        paragraphs: ['Carrier calling, SMS/MMS, data, roaming, map, public-safety, and device services may have separate terms, limitations, and charges. Public Emergency Codes does not control those services.'],
      },
      {
        heading: 'No warranty',
        paragraphs: ['Contact is provided “as is” and “as available,” without guarantees of uninterrupted operation, accuracy, delivery, compatibility, fitness for a particular purpose, or emergency response. Nothing in these terms excludes rights or liabilities that cannot legally be excluded.'],
      },
      {
        heading: 'Open-source license',
        paragraphs: ['The application source is licensed under the 0BSD license. Third-party components remain governed by their respective licenses. See Open-Source Licenses in About & Legal.'],
      },
      {
        heading: 'Changes and contact',
        paragraphs: ['Features and these terms may change in later releases. Questions may be sent to support@emergency.codes. Do not use that address for an active emergency.'],
      },
    ],
  },
  data: {
    title: 'Data Management',
    updated,
    summary: 'Contact has no user accounts. Your app profile and most app data are stored locally on this device.',
    sections: [
      {
        heading: 'No account to delete',
        paragraphs: ['Contact does not create or operate user accounts, so there is no cloud account-deletion request. Removing local data does not remove copies already delivered to carriers, recipients, emergency services, or third-party apps.'],
      },
      {
        heading: 'Delete individual information',
        bullets: [
          'Use Emergency Info, Emergency Contacts, and Saved Addresses to edit or remove saved information.',
          'Use View Recordings to delete stored emergency recordings.',
          'Delete calls and messages through Contact or the applicable Android communication history controls.',
          'Revoke permissions through App Permissions or Android system settings.',
        ],
        paragraphs: [],
      },
      {
        heading: 'Delete all local app data',
        paragraphs: ['Open Android Settings, select Apps, select Contact, then Storage & cache and Clear storage. Uninstalling Contact also removes app-private local data, subject to Android backup and device-manufacturer behavior. Clearing storage resets permissions and configuration and cannot be undone.'],
      },
      {
        heading: 'Automatic limits',
        paragraphs: ['Emergency history is limited to 50 records and scheduled to remove records older than 90 days. Location breadcrumbs are limited to 500 points. Recordings are retained until you delete them or clear app storage.'],
      },
      {
        heading: 'Data already sent',
        paragraphs: ['Calls, messages, media, or information you send may be retained by the recipient, carrier, emergency service, operating system, or selected third-party service. Contact cannot delete data from systems it does not operate.'],
      },
    ],
  },
  licenses: {
    title: 'Open-Source Licenses',
    updated,
    summary: 'Contact is open-source software and includes third-party open-source components.',
    sections: [
      {
        heading: 'Contact application',
        paragraphs: ['Copyright Public Emergency Codes contributors. The Contact source code is distributed under the Zero-Clause BSD (0BSD) license.'],
      },
      {
        heading: '0BSD license',
        paragraphs: ['Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted.', 'THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.'],
      },
      {
        heading: 'Third-party software',
        paragraphs: ['This application includes React Native, Expo modules, AndroidX, and other packages under permissive and open-source licenses including Apache-2.0, MIT, BSD, ISC, MPL-2.0, and compatible licenses. Copyright and license notices remain with their respective authors.', 'The complete dependency inventory and authoritative license files are included with the source repository and dependency packages. Nothing on this page changes a third party’s license terms.'],
      },
    ],
  },
};

export const LEGAL_LINKS: Array<{ key: LegalDocumentKey; title: string; description: string }> = [
  { key: 'privacy', title: 'Privacy Policy', description: 'How Contact accesses, stores, uses, and shares information.' },
  { key: 'emergency', title: 'Emergency & Medical Disclaimer', description: 'Important limitations for emergency and medical use.' },
  { key: 'terms', title: 'Terms of Use', description: 'Rules, responsibilities, third-party services, and warranties.' },
  { key: 'data', title: 'Data Management', description: 'Manage or remove local app data; no account is created.' },
  { key: 'licenses', title: 'Open-Source Licenses', description: 'Contact’s 0BSD license and third-party notices.' },
];
