import Soloman from "./pages/soloman";

function App() {
  return (
    <div className="h-screen w-screen bg-gray-900">
      
      {/* Header */}
      <div className="absolute top-0 left-0 z-[1000] w-full p-4 bg-black/50 backdrop-blur text-white">
        <h1 className="text-xl font-semibold">
          🌍 Solomon Islands Environmental Dashboard
        </h1>
        <p className="text-xs opacity-70">
          Last Updated: Live via Google Earth Engine
        </p>
      </div>

      {/* Map Page */}
      <Soloman />

    </div>
  );
}

export default App;