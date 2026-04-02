// en.ts — English translations for Pallas
// Struktur identisch zu de.ts für einfache i18next-Migration

const en = {
  // General
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    loading: 'Loading...',
    error: 'Error',
    close: 'Close',
    search: 'Search...',
    noResults: 'No results for',
    newEntry: '+ New Entry',
    entries: 'Entries',
  },

  // Sidebar
  sidebar: {
    dashboard: 'Dashboard',
    journal: 'Journal',
    calendar: 'Calendar',
    notes: 'Notes',
    metis: 'Metis',
    version: 'v0.1.0 — ONLINE',
    collapse: 'Collapse sidebar',
    expand: 'Expand sidebar',
    logout: 'Log out',
    ollamaMacbook: 'MacBook',
    ollamaServer: 'Server',
    ollamaOffline: 'Ollama offline',  },

  // Welcome Page
  welcome: {
    subtitle: 'Your personal knowledge & productivity system',
    dashboardTitle: 'Dashboard',
    dashboardDesc: 'Manage modules, documents and summaries.',
    journalTitle: 'Journal',
    journalDesc: 'Encrypted diary with mood analysis and mindmaps.',
    calendarTitle: 'Calendar',
    calendarDesc: 'Plan and manage appointments and events.',
    notesTitle: 'Notes',
    notesDesc: 'Markdown notes with bi-directional links.',
    metisTitle: 'Metis',
    metisDesc: 'Your Second Brain — connections detected automatically.',
    hint: 'Choose an area to get started.',
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    newFolder: '+ Folder',
    newModule: '+ Module',
    cancelFolder: 'Cancel',
    cancelModule: 'Cancel',
    folderFormTitle: 'New Folder',
    moduleFormTitle: 'New Module',
    folderName: 'Name',
    folderPlaceholder: 'e.g. Spring Semester 26',
    createFolder: 'Create Folder',
    moduleName: 'Name',
    modulePlaceholder: 'e.g. Linear Algebra',
    moduleDescription: 'Description',
    moduleDescPlaceholder: 'e.g. Math Semester 2',
    createModule: 'Create Module',
    emptyRoot: 'Nothing here yet.',
    emptyFolder: 'Folder is empty.',
    emptyHint: 'Create a folder or module to get started.',
    moveFailed: 'Move failed',
  },

  // Main Calendar
  mainCalendar: {
    title: 'Calendar',
    newEvent: '+ New Event',
    editEvent: 'Edit Event',
    deleteEvent: 'Delete Event',
    deleteConfirm: 'Really delete this event?',
    eventTitle: 'Title',
    eventTitlePlaceholder: 'e.g. Doctor appointment',
    description: 'Description',
    descriptionPlaceholder: 'Optional note...',
    startTime: 'Start time',
    endTime: 'End time',
    allDay: 'All day',
    color: 'Color',
    recurrence: 'Recurrence',
    recurrenceEnd: 'Repeat until',
    recurrenceTypes: {
      none: 'None',
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      yearly: 'Yearly',
    },
    colors: {
      cyan: 'Cyan',
      violet: 'Violet',
      emerald: 'Emerald',
      orange: 'Orange',
      pink: 'Pink',
      yellow: 'Yellow',
    },
    emptyTitle: 'No events yet.',
    emptyHint: 'Create an event to get started.',
    today: 'Today',
    agenda: 'Next 7 days',
    agendaEmpty: 'No events in the next 7 days.',
    recurring: 'Recurring',
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  },

  // Journal — Main
  journal: {
    title: 'Journal',
    lock: 'Lock',
    medTracking: 'Medication Tracking',
    systemInit: 'Systems initializing...',
    tabs: {
      entries: 'Entries',
      calendar: 'Calendar',
    notes: 'Notes',
    metis: 'Metis',
      mood: 'Mood',
      clusters: 'Topics',
      storylines: 'Storylines',
      medications: 'Medications',
      insights: 'Insights',
    },
  },

  // Journal Setup
  journalSetup: {
    title: 'Set up Journal',
    description: 'Set a password for your encrypted journal. This password cannot be reset.',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    submit: 'Set up Journal',
  },

  // Journal Unlock
  journalUnlock: {
    title: 'Unlock Journal',
    description: 'Enter your password to access your entries.',
    placeholder: 'Enter password',
    submit: 'Unlock',
  },

  // Entry Form
  entryForm: {
    titleNew: 'New Entry',
    titleEdit: 'Edit Entry',
    dateLabel: 'Date',
    titleLabel: 'Title',
    titlePlaceholder: 'Enter your own title...',
    titlePlaceholderEdit: 'Title',
    autoTitleOn: '✕ Use auto-title',
    autoTitleOff: '✎ Enter title manually',
    autoTitleHint: 'Will be generated from the content automatically',
    contentLabel: 'Content',
    contentPlaceholder: 'Write down your thoughts...',
    saveNew: 'Save Entry',
    saveEdit: 'Save',
  },

  // Entry List
  entryList: {
    emptyTitle: 'No entries yet.',
    emptyHint: 'Click "+ New Entry" to get started.',
  },

  // Calendar (Journal)
  calendar: {
    moodGlow: 'Mood Glow',
    loading: 'Loading calendar...',
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    noEntries: 'No entries for this day.',
  },

  // Mood Chart
  moodChart: {
    title: 'Mood Timeline',
    loading: 'Analyzing mood...',
    empty: 'No mood data yet. Create entries to see your mood timeline.',
    unknown: 'unknown',
    confidence: 'Confidence',
  },

  // Cluster View
  clusterView: {
    title: 'Topic Clusters',
    openMindmap: 'Open Mindmap',
    loading: 'Analyzing topics...',
    empty: 'No clusters yet. At least 2 entries needed.',
    entries: 'Entries',
  },

  // Storyline View
  storylineView: {
    title: 'Storylines',
    loading: 'Detecting storylines...',
    empty: 'No storylines detected yet. At least 3 entries needed.',
    confidence: 'Confidence',
    linkedEntries: 'linked entries',
    arcTypes: {
      rising: 'Rising',
      falling: 'Falling',
      resolved: 'Resolved',
      ongoing: 'Ongoing',
    },
  },

  // Medications
  medication: {
    formTitleNew: 'New Medication',
    formTitleEdit: 'Edit Medication',
    name: 'Name',
    namePlaceholder: 'e.g. Ibuprofen',
    dosage: 'Dosage',
    dosagePlaceholder: 'e.g. 400mg',
    frequency: 'Frequency',
    frequencyPlaceholder: 'e.g. twice daily',
    startDate: 'Start Date',
    endDate: 'End Date (optional)',
    notes: 'Notes / Side Effects (optional)',
    notesPlaceholder: 'e.g. Do not take on empty stomach...',
    newMedication: '+ New Medication',
    emptyTitle: 'No medications yet.',
    emptyHint: 'Click "+ New Medication" to get started.',
    since: 'since',
    until: 'until',
    backfill: 'Backfill',
    taken: 'Taken',
    skipped: 'Skipped',
    saved: 'Saved',
  },

  // Medication Reminder (Modal after unlock)
  medReminder: {
    title: 'Medication Reminder',
    description: 'These medications have not been confirmed today:',
    confirmAll: 'Mark all as taken',
    confirming: 'Saving...',
    later: 'Later',
  },

  // Module Detail
  moduleDetail: {
    backToDashboard: '← Back to Dashboard',
    notFound: 'Module not found.',
    uploadTitle: 'Upload Document',
    uploadHint: 'Supported formats: PDF, Word, PowerPoint, Excel, Markdown, TXT, Images (OCR)',
    uploadButton: 'Choose File',
    uploading: 'Uploading...',
    documentsTitle: 'Documents',
    emptyDocs: 'No documents yet.',
    emptyDocsHint: 'Upload a document to get started.',
    summarize: 'Summarize',
    generating: 'Generating...',
    summaryTitle: 'Summary',
    openMindmap: 'Open Mindmap',
    generatingMindmap: 'Creating mindmap...',
    moduleLoading: 'Loading module...',
  },

  // Mindmap Pages
  mindmap: {
    title: 'Mindmap',
    journalTitle: 'Journal Mindmap',
    backToDashboard: '← Back',
    backToJournal: '← Journal',
    generating: 'Generating mindmap',
    generatingHint: 'Building neural network...',
    journalGeneratingHint: 'Analyzing clusters and storylines...',
    expanding: 'Expanding...',
    layoutTree: 'Tree',
    layoutNeural: 'Neural',
    minEntries: 'At least 2 entries needed for the mindmap.',
    themes: 'Topics',
    storylines: 'Storylines',
    entry: 'Entry',
},
  // Insights — Journal data analysis
  insights: {
    title: 'Insights',
    subtitle: 'Choose an analysis to discover patterns in your data.',
    analyzing: 'Analyzing...',
    noData: 'Not enough data for this analysis.',
    medMood: 'Medication ↔ Mood',
    medMoodDesc: 'How do your medications affect your mood?',
    weekdayMood: 'Weekday ↔ Mood',
    weekdayMoodDesc: 'Which days do you feel best?',
    writingPatterns: 'Writing Patterns',
    writingPatternsDesc: 'How does regular writing affect your mood?',
    keywordMood: 'Keywords ↔ Mood',
    keywordMoodDesc: 'Which topics correlate with good or bad mood?',
    aiSummary: 'AI Summary',
    aiSummaryDesc: 'Ollama summarizes all detected patterns.',
    withMed: 'With medication',
    withoutMed: 'Without medication',
    days: 'days',
    totalEntries: 'Total entries',
    writingDays: 'Days with entries',
    avgLength: 'Avg. length',
    chars: 'characters',
    moodWriting: 'Avg. mood (writing days)',
    moodSilent: 'Avg. mood (silent days)',
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
  login: {
    placeholder: 'Password',
    button: 'Sign in',
    error: 'Login failed',
  },

  // Notes
  notes: {
    title: 'Notes',
    newNote: 'New Note',
    untitled: 'Untitled',
    searchPlaceholder: 'Search notes...',
    noNotes: 'No notes yet',
    noNoteSelected: 'Select a note or create a new one',
    deleteConfirm: 'Really delete this note?',
    saved: 'Saved',
    links: 'Linked Notes',
    noLinks: 'No links found',
    backlinks: 'Backlinks',  },
} as const
export default en