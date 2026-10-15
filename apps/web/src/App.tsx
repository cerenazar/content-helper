import { useEffect, useState } from 'react';
import { Home, type Section } from './Home';
import { Editor } from './Editor';

/** Basit hash yönlendirme: #/ → ana sayfa, #/projects, #/ideas, #/p/<slug> → editör. */
function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const m = /^#\/p\/([a-z0-9-]+)/.exec(hash);
  const section: Section = hash.startsWith('#/projects') ? 'projects' : hash.startsWith('#/ideas') ? 'ideas' : 'home';
  return { slug: m ? m[1] : null, section };
}

export function App() {
  const { slug, section } = useRoute();
  return slug ? <Editor key={slug} slug={slug} /> : <Home section={section} />;
}
