import { render } from 'preact';
import { store } from './model/store';
import { App } from './ui/App';
import './styles.css';

store.restore().finally(() => render(<App />, document.getElementById('app')!));
