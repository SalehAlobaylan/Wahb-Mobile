export type SearchFixture = {
  id: string;
  type: 'NEWS' | 'VIDEO' | 'PODCAST';
  title: string;
  source: string;
  excerpt: string;
};

export const searchFixtures: readonly SearchFixture[] = [
  {
    id: '0f723046-6d6d-4ef8-ae28-500000000001',
    type: 'NEWS',
    title: 'كيف تغيّر الأخبار السريعة طريقة فهمنا للأحداث؟',
    source: 'Wahb Editorial',
    excerpt: 'قراءة مختصرة في التغطية والسياق والمصادر.',
  },
  {
    id: '0f723046-6d6d-4ef8-ae28-500000000002',
    type: 'PODCAST',
    title: 'A quieter way to follow the world',
    source: 'Wahb Audio',
    excerpt: 'A sample editorial podcast card for native search.',
  },
  {
    id: '0f723046-6d6d-4ef8-ae28-500000000003',
    type: 'VIDEO',
    title: 'الذكاء الاصطناعي بين الضجيج والفائدة',
    source: 'Wahb Studio',
    excerpt: 'فيديو تجريبي يعكس شكل نتائج البحث.',
  },
] as const;
