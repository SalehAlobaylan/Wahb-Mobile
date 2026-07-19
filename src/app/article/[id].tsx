import { useLocalSearchParams } from 'expo-router';
import { ArticleReaderScreen } from '@/features/article-reader/article-reader-screen';

export default function ArticleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArticleReaderScreen id={id} />;
}
