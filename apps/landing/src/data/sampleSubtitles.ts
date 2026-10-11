import type { SubtitleCue, LanguageOption } from '../types/simulator';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'tr', name: 'Turkish', flag: '🇹🇷', nativeName: 'Türkçe' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', nativeName: 'Español' },
  { code: 'de', name: 'German', flag: '🇩🇪', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', flag: '🇫🇷', nativeName: 'Français' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', nativeName: '日本語' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦', nativeName: 'العربية' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', nativeName: '中文' }
];

export const SAMPLE_CUES: SubtitleCue[] = [
  {
    id: 1,
    startTime: 0,
    endTime: 4,
    originalText: "Language acquisition becomes natural when context connects with curiosity.",
    words: [
      {
        word: "Language",
        cleanWord: "language",
        phonetic: "/ˈlæŋ.ɡwɪdʒ/",
        pos: "noun",
        definition: "A structured system of communication used by humans consisting of spoken, signed, or written words.",
        translations: {
          tr: "Dil, lisan",
          es: "Idioma, lenguaje",
          de: "Sprache",
          fr: "Langue, langage",
          ja: "言語 (gengo)",
          ru: "Язык",
          ar: "لغة",
          zh: "语言"
        }
      },
      {
        word: "acquisition",
        cleanWord: "acquisition",
        phonetic: "/ˌæk.wɪˈzɪʃ.ən/",
        pos: "noun",
        definition: "The learning or developing of a skill, habit, or quality over time.",
        translations: {
          tr: "Kazanım, edinme",
          es: "Adquisición",
          de: "Erwerb, Aneignung",
          fr: "Acquisition",
          ja: "習得 (shūtoku)",
          ru: "Приобретение, усвоение",
          ar: "اكتساب",
          zh: "习得，获得"
        }
      },
      {
        word: "becomes",
        cleanWord: "becomes",
        phonetic: "/bɪˈkʌmz/",
        pos: "verb",
        definition: "Begins to be; develops into.",
        translations: {
          tr: "Haline gelir, olur",
          es: "Se vuelve, se convierte",
          de: "Wird",
          fr: "Devient",
          ja: "〜になる (naru)",
          ru: "Становится",
          ar: "يصبح",
          zh: "变得，成为"
        }
      },
      {
        word: "natural",
        cleanWord: "natural",
        phonetic: "/ˈnætʃ.ər.əl/",
        pos: "adjective",
        definition: "Existing in or caused by nature; not artificial, instinctive.",
        translations: {
          tr: "Doğal, zahmetsiz",
          es: "Natural, espontáneo",
          de: "Natürlich",
          fr: "Naturel",
          ja: "自然な (shizen na)",
          ru: "Естественный",
          ar: "طبيعي",
          zh: "自然的"
        }
      },
      {
        word: "when",
        cleanWord: "when",
        phonetic: "/wen/",
        pos: "conjunction",
        definition: "At or during the time that.",
        translations: {
          tr: "-dığında, zaman",
          es: "Cuando",
          de: "Wenn",
          fr: "Quand, lorsque",
          ja: "〜の時 (no toki)",
          ru: "Когда",
          ar: "عندما",
          zh: "当……时"
        }
      },
      {
        word: "context",
        cleanWord: "context",
        phonetic: "/ˈkɒn.tekst/",
        pos: "noun",
        definition: "The circumstances that form the setting for an event, statement, or idea, enabling full comprehension.",
        translations: {
          tr: "Bağlam, ortam",
          es: "Contexto",
          de: "Kontext, Zusammenhang",
          fr: "Contexte",
          ja: "文脈 (bunmyaku)",
          ru: "Контекст",
          ar: "سياق",
          zh: "上下文，语境"
        }
      },
      {
        word: "connects",
        cleanWord: "connects",
        phonetic: "/kəˈnekts/",
        pos: "verb",
        definition: "Brings together or into contact so that a real link is established.",
        translations: {
          tr: "Bağlantı kurar, birleşir",
          es: "Conecta, enlaza",
          de: "Verbindet",
          fr: "Relie, connecte",
          ja: "結びつく (musubitsuku)",
          ru: "Соединяется",
          ar: "يتصل",
          zh: "联系，连接"
        }
      },
      {
        word: "with",
        cleanWord: "with",
        phonetic: "/wɪð/",
        pos: "preposition",
        definition: "Accompanied by; in the company of.",
        translations: {
          tr: "İle, birlikte",
          es: "Con",
          de: "Mit",
          fr: "Avec",
          ja: "〜と共に (to tomo ni)",
          ru: "С",
          ar: "مع",
          zh: "同，和"
        }
      },
      {
        word: "curiosity.",
        cleanWord: "curiosity",
        phonetic: "/ˌkjʊə.riˈɒs.ə.ti/",
        pos: "noun",
        definition: "A strong desire to know or learn something new.",
        translations: {
          tr: "Merak, öğrenme hevesi",
          es: "Curiosidad",
          de: "Neugierde",
          fr: "Curiosité",
          ja: "好奇心 (kōkishin)",
          ru: "Любопытство",
          ar: "فضول",
          zh: "好奇心"
        }
      }
    ],
    translations: {
      tr: "Bağlam merakla birleştiğinde dil edinimi doğal hale gelir.",
      es: "La adquisición del idioma se vuelve natural cuando el contexto se conecta con la curiosidad.",
      de: "Spracherwerb wird natürlich, wenn Kontext auf Neugier trifft.",
      fr: "L'apprentissage des langues devient naturel lorsque le contexte rencontre la curiosité.",
      ja: "文脈が好奇心と結びついたとき、言語習得は自然なものになります。",
      ru: "Усвоение языка становится естественным, когда контекст встречается с любопытством.",
      ar: "يصبح اكتساب اللغة أمراً طبيعياً عندما يرتبط السياق بالفضول.",
      zh: "当语境与好奇心结合时，语言习得就变得自然而然。"
    }
  },
  {
    id: 2,
    startTime: 4,
    endTime: 8,
    originalText: "Interactive subtitles transform passive entertainment into active fluency.",
    words: [
      {
        word: "Interactive",
        cleanWord: "interactive",
        phonetic: "/ˌɪn.təˈræk.tɪv/",
        pos: "adjective",
        definition: "Allowing a two-way flow of information between a user and a system.",
        translations: {
          tr: "Etkileşimli, interaktif",
          es: "Interactivo",
          de: "Interaktiv",
          fr: "Interactif",
          ja: "対話型の (taiwa-gata no)",
          ru: "Интерактивный",
          ar: "تفاعلي",
          zh: "互动的，交互式的"
        }
      },
      {
        word: "subtitles",
        cleanWord: "subtitles",
        phonetic: "/ˈsʌbˌtaɪ.təlz/",
        pos: "noun",
        definition: "Captions displayed at the bottom of a video screen translating or transcribing the dialogue.",
        translations: {
          tr: "Altyazılar",
          es: "Subtítulos",
          de: "Untertitel",
          fr: "Sous-titres",
          ja: "字幕 (jimaku)",
          ru: "Субтитры",
          ar: "الترجمة المرئية",
          zh: "字幕"
        }
      },
      {
        word: "transform",
        cleanWord: "transform",
        phonetic: "/trænsˈfɔːm/",
        pos: "verb",
        definition: "Make a marked change in the form, nature, or appearance of.",
        translations: {
          tr: "Dönüştürür",
          es: "Transforma",
          de: "Verwandelt",
          fr: "Transforme",
          ja: "変革する (henkaku suru)",
          ru: "Преобразует",
          ar: "يحول",
          zh: "改变，转化"
        }
      },
      {
        word: "passive",
        cleanWord: "passive",
        phonetic: "/ˈpæs.ɪv/",
        pos: "adjective",
        definition: "Accepting or allowing what happens without active response or resistance.",
        translations: {
          tr: "Pasif, edilgen",
          es: "Pasivo",
          de: "Passiv",
          fr: "Passif",
          ja: "受動的な (judōteki na)",
          ru: "Пассивный",
          ar: "سلبي",
          zh: "被动的"
        }
      },
      {
        word: "entertainment",
        cleanWord: "entertainment",
        phonetic: "/ˌen.təˈteɪn.mənt/",
        pos: "noun",
        definition: "The action of providing or being provided with amusement or enjoyment.",
        translations: {
          tr: "Eğlence",
          es: "Entretenimiento",
          de: "Unterhaltung",
          fr: "Divertissement",
          ja: "エンターテインメント",
          ru: "Развлечение",
          ar: "ترفيه",
          zh: "娱乐"
        }
      },
      {
        word: "into",
        cleanWord: "into",
        phonetic: "/ˈɪn.tuː/",
        pos: "preposition",
        definition: "Expressing movement or action with the result that someone or something makes a transition.",
        translations: {
          tr: "-e, haline",
          es: "En, hacia",
          de: "In",
          fr: "En",
          ja: "〜へ (e)",
          ru: "В",
          ar: "إلى",
          zh: "进入，变成"
        }
      },
      {
        word: "active",
        cleanWord: "active",
        phonetic: "/ˈæk.tɪv/",
        pos: "adjective",
        definition: "Engaging or ready to engage in physically or mentally energetic pursuits.",
        translations: {
          tr: "Aktif, etkin",
          es: "Activo",
          de: "Aktiv",
          fr: "Actif",
          ja: "能動的な (nōdōteki na)",
          ru: "Активный",
          ar: "نشط",
          zh: "主动的，积极的"
        }
      },
      {
        word: "fluency.",
        cleanWord: "fluency",
        phonetic: "/ˈfluː.ən.si/",
        pos: "noun",
        definition: "The ability to speak or write a foreign language easily and accurately.",
        translations: {
          tr: "Akıcılık, yetkinlik",
          es: "Fluidez",
          de: "Flüssigkeit, Sprachgewandtheit",
          fr: "Aisance, fluidité",
          ja: "流暢さ (ryūchō-sa)",
          ru: "Беглость речи",
          ar: "طلاقة",
          zh: "流利度"
        }
      }
    ],
    translations: {
      tr: "İnteraktif altyazılar pasif eğlenceyi aktif bir dil akıcılığına dönüştürür.",
      es: "Los subtítulos interactivos transforman el entretenimiento pasivo en fluidez activa.",
      de: "Interaktive Untertitel verwandeln passive Unterhaltung in aktive Sprachbeherrschung.",
      fr: "Les sous-titres interactifs transforment le divertissement passif en fluidité active.",
      ja: "インタラクティブな字幕は、受動的な娯楽を能動的な流暢さへと変えます。",
      ru: "Интерактивные субтитры превращают пассивный просмотр в активное владение языком.",
      ar: "تحول الترجمة التفاعلية الترفيه السلبي إلى طلاقة لغوية نشطة.",
      zh: "交互式字幕将被动娱乐转化为主动的语言流利度。"
    }
  }
];
