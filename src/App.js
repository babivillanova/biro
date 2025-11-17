import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';
import Edit from './pages/Edit';
import IfcImporter from './pages/IfcImporter';
import FragmentLibrary from './pages/FragmentLibrary';
import StressTest from './pages/StressTest';
import ModelExplorer from './pages/ModelExplorer';
import Disney from './pages/Disney';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="app-nav">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/edit" className="nav-link">Edit Example Model</Link>
          <Link to="/ifc-importer" className="nav-link">IFC Importer</Link>
          <Link to="/library" className="nav-link">Library</Link>
          <Link to="/disney" className="nav-link">Disney</Link>
          <Link to="/stress-test" className="nav-link">Stress Test</Link>
        </nav>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/edit" element={<Edit />} />
          <Route path="/edit/:fragmentId" element={<Edit />} />
          <Route path="/ifc-importer" element={<IfcImporter />} />
          <Route path="/library" element={<FragmentLibrary />} />
          <Route path="/stress-test" element={<StressTest />} />
          <Route path="/explore/:fragmentId" element={<ModelExplorer />} />
          <Route path="/disney" element={<Disney />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
