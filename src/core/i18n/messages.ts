export const resources = {
  ar: {
    translation: {
      foundation: {
        eyebrow: 'تطبيق وهب',
        title: 'المحتوى الذي يستحق وقتك.',
        description:
          'تجربة أصلية للآيفون والأندرويد، مبنية للاستماع، القراءة، والاكتشاف بدون ضوضاء.',
        status: 'الأساس جاهز',
        iosFirst: 'الآيفون أولاً',
        guest: 'تصفح بدون حساب',
        offline: 'مصمم للتنزيل لاحقاً',
        note: 'الخطوة التالية: بناء أول مسار كامل من واجهة وهب إلى خدمات المحتوى.',
      },
      foryou: {
        feedLabel: 'من أجلك',
        loading: 'جارٍ إعداد جلستك…',
        unavailable: 'تعذّر تحميل المحتوى الآن.',
        unavailableDescription:
          'احتفظنا بأي جلسة محفوظة. حاول مجددًا عند عودة الاتصال.',
        retry: 'إعادة المحاولة',
        refreshing: 'جارٍ تحديث الجلسة…',
        newContent: 'محتوى جديد',
        caughtUp: 'لقد وصلت إلى نهاية هذه الجلسة.',
        caughtUpDescription: 'سيظهر المحتوى الجديد عند تحديث مقصود.',
        play: 'تشغيل',
        pause: 'إيقاف مؤقت',
        previous: 'العنصر السابق',
        next: 'العنصر التالي',
        playbackError: 'تعذّر تشغيل هذا المصدر. أعد المحاولة أو أبلغ عنه.',
        upNext: 'التالي خلال {{seconds}}',
      },
    },
  },
  en: {
    translation: {
      foundation: {
        eyebrow: 'WAHB MOBILE',
        title: 'Content worthy of your time.',
        description:
          'A native iPhone and Android experience built for listening, reading, and discovery without the noise.',
        status: 'Foundation ready',
        iosFirst: 'iPhone first',
        guest: 'Browse as a guest',
        offline: 'Download-ready architecture',
        note: 'Next: build the first complete path from Wahb’s interface to its content services.',
      },
      foryou: {
        feedLabel: 'FOR YOU',
        loading: 'Preparing your session…',
        unavailable: 'Content is unavailable right now.',
        unavailableDescription:
          'Any saved session remains safe. Try again when the connection returns.',
        retry: 'Retry',
        refreshing: 'Refreshing your session…',
        newContent: 'New Content',
        caughtUp: 'You reached the end of this session.',
        caughtUpDescription:
          'New content appears through an intentional refresh.',
        play: 'Play',
        pause: 'Pause',
        previous: 'Previous item',
        next: 'Next item',
        playbackError: 'This source could not play. Retry or report it.',
        upNext: 'Up next in {{seconds}}',
      },
    },
  },
} as const;
