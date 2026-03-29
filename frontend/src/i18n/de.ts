// de.ts — Deutsche Übersetzungen für Pallas
// Struktur: Bereich → Schlüssel → Text
// Bei i18next-Migration: Diese Datei wird 1:1 zum JSON-Namespace

const de = {
  // Allgemein
  common: {
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    back: 'Zurück',
    loading: 'Wird geladen...',
    error: 'Fehler',
    close: 'Schliessen',
    search: 'Suche...',
    noResults: 'Keine Treffer für',
    newEntry: '+ Neuer Eintrag',
    entries: 'Einträge',
  },

  // Sidebar
  sidebar: {
    dashboard: 'Dashboard',
    journal: 'Journal',
    version: 'v0.1.0 — ONLINE',
  },

  // Begrüssungsseite
  welcome: {
    subtitle: 'Dein persönliches Wissens- & Produktivitätssystem',
    dashboardTitle: 'Dashboard',
    dashboardDesc: 'Module, Dokumente und Zusammenfassungen verwalten.',
    journalTitle: 'Journal',
    journalDesc: 'Verschlüsseltes Tagebuch mit Stimmungsanalyse und Mindmaps.',
    hint: 'Wähle einen Bereich oder nutze die Sidebar zur Navigation.',
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    newFolder: '+ Ordner',
    newModule: '+ Modul',
    cancelFolder: 'Abbrechen',
    cancelModule: 'Abbrechen',
    folderFormTitle: 'Neuer Ordner',
    moduleFormTitle: 'Neues Modul',
    folderName: 'Name',
    folderPlaceholder: 'z.B. Frühjahrssemester 26',
    createFolder: 'Ordner erstellen',
    moduleName: 'Name',
    modulePlaceholder: 'z.B. Lineare Algebra',
    moduleDescription: 'Beschreibung',
    moduleDescPlaceholder: 'z.B. Mathe Semester 2',
    createModule: 'Modul erstellen',
    emptyRoot: 'Noch nichts vorhanden.',
    emptyFolder: 'Ordner ist leer.',
    emptyHint: 'Erstelle einen Ordner oder ein Modul um loszulegen.',
    moveFailed: 'Verschieben fehlgeschlagen',
  },

  // Journal — Haupt
  journal: {
    title: 'Journal',
    lock: 'Sperren',
    medTracking: 'Medikamenten-Tracking',
    systemInit: 'Systeme werden initialisiert...',
    tabs: {
      entries: 'Einträge',
      calendar: 'Kalender',
      mood: 'Stimmung',
      clusters: 'Themen',
      storylines: 'Storylines',
      medications: 'Medikamente',
    },
  },

  // Journal Setup
  journalSetup: {
    title: 'Journal einrichten',
    description: 'Setze ein Passwort für dein verschlüsseltes Tagebuch. Dieses Passwort kann nicht zurückgesetzt werden.',
    passwordLabel: 'Passwort',
    passwordPlaceholder: 'Mindestens 8 Zeichen',
    submit: 'Journal einrichten',
  },

  // Journal Unlock
  journalUnlock: {
    title: 'Journal entsperren',
    description: 'Gib dein Passwort ein um auf deine Einträge zuzugreifen.',
    placeholder: 'Passwort eingeben',
    submit: 'Entsperren',
  },

  // Entry Form
  entryForm: {
    titleNew: 'Neuer Eintrag',
    titleEdit: 'Eintrag bearbeiten',
    dateLabel: 'Datum',
    titleLabel: 'Titel',
    titlePlaceholder: 'Eigenen Titel eingeben...',
    titlePlaceholderEdit: 'Titel',
    autoTitleOn: '✕ Auto-Titel verwenden',
    autoTitleOff: '✎ Titel selbst eingeben',
    autoTitleHint: 'Wird automatisch aus dem Inhalt generiert',
    contentLabel: 'Inhalt',
    contentPlaceholder: 'Schreibe deine Gedanken auf...',
    saveNew: 'Eintrag speichern',
    saveEdit: 'Speichern',
  },

  // Entry List
  entryList: {
    emptyTitle: 'Noch keine Einträge.',
    emptyHint: 'Klicke auf "+ Neuer Eintrag" um zu beginnen.',
  },

  // Kalender
  calendar: {
    moodGlow: 'Mood-Glow',
    loading: 'Kalender wird geladen...',
    months: [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
    ],
    weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    noEntries: 'Keine Einträge für diesen Tag.',
  },

  // Mood Chart
  moodChart: {
    title: 'Stimmungsverlauf',
    loading: 'Stimmung wird analysiert...',
    empty: 'Noch keine Mood-Daten. Erstelle Einträge um deinen Stimmungsverlauf zu sehen.',
    unknown: 'unbekannt',
    confidence: 'Konfidenz',
  },

  // Cluster View
  clusterView: {
    title: 'Themen-Cluster',
    openMindmap: 'Mindmap öffnen',
    loading: 'Themen werden analysiert...',
    empty: 'Noch keine Cluster. Mindestens 2 Einträge nötig.',
    entries: 'Einträge',
  },

  // Storyline View
  storylineView: {
    title: 'Storylines',
    loading: 'Storylines werden erkannt...',
    empty: 'Noch keine Storylines erkannt. Mindestens 3 Einträge nötig.',
    confidence: 'Konfidenz',
    linkedEntries: 'verknüpfte Einträge',
    arcTypes: {
      rising: 'Steigend',
      falling: 'Abklingend',
      resolved: 'Abgeschlossen',
      ongoing: 'Offen',
    },
  },

  // Medikamente
  medication: {
    formTitleNew: 'Neues Medikament',
    formTitleEdit: 'Medikament bearbeiten',
    name: 'Name',
    namePlaceholder: 'z.B. Ibuprofen',
    dosage: 'Dosis',
    dosagePlaceholder: 'z.B. 400mg',
    frequency: 'Frequenz',
    frequencyPlaceholder: 'z.B. 2x täglich',
    startDate: 'Start-Datum',
    endDate: 'End-Datum (optional)',
    notes: 'Notizen / Nebenwirkungen (optional)',
    notesPlaceholder: 'z.B. Nicht auf leeren Magen nehmen...',
    newMedication: '+ Neues Medikament',
    emptyTitle: 'Noch keine Medikamente.',
    emptyHint: 'Klicke auf "+ Neues Medikament" um zu beginnen.',
    since: 'seit',
    until: 'bis',
  },

  // Medikamenten-Erinnerung (Modal nach Unlock)
  medReminder: {
    title: 'Medikamenten-Erinnerung',
    description: 'Diese Medikamente wurden heute noch nicht bestätigt:',
    confirmAll: 'Alle als genommen markieren',
    confirming: 'Wird gespeichert...',
    later: 'Später',
  },

  // Modul-Detail
  moduleDetail: {
    backToDashboard: '← Zurück zum Dashboard',
    notFound: 'Modul nicht gefunden.',
    uploadTitle: 'Dokument hochladen',
    uploadHint: 'Unterstützte Formate: PDF, Word, PowerPoint, Excel, Markdown, TXT, Bilder (OCR)',
    uploadButton: 'Datei auswählen',
    uploading: 'Wird hochgeladen...',
    documentsTitle: 'Dokumente',
    emptyDocs: 'Noch keine Dokumente.',
    emptyDocsHint: 'Lade ein Dokument hoch um loszulegen.',
    summarize: 'Zusammenfassen',
    generating: 'Generiert...',
    summaryTitle: 'Zusammenfassung',
    openMindmap: 'Mindmap öffnen',
    generatingMindmap: 'Mindmap wird erstellt...',
    moduleLoading: 'Modul wird geladen...',
  },

  // Mindmap Pages
  mindmap: {
    title: 'Mindmap',
    journalTitle: 'Journal-Mindmap',
    backToDashboard: '← Zurück',
    backToJournal: '← Journal',
    generating: 'Mindmap wird generiert',
    generatingHint: 'Neuronales Netz wird aufgebaut...',
    journalGeneratingHint: 'Cluster und Storylines werden analysiert...',
    expanding: 'Wird erweitert...',
    layoutTree: 'Tree',
    layoutNeural: 'Neural',
    minEntries: 'Mindestens 2 Einträge für die Mindmap nötig.',
    themes: 'Themen',
    storylines: 'Storylines',
    entry: 'Eintrag',
  },
} as const

export default de