import { Link } from 'react-router-dom'
import { authAPI } from '../services/api'

export default function Home() {
  const isAuthenticated = authAPI.isAuthenticated()

  return (
    <div className="animate-fade-in">
      {/* Hero section */}
      <section className="mb-24">
        <div className="relative">
          {/* Decorative coordinate grid */}
          <div className="absolute -top-8 -left-4 text-mono text-xs text-contour opacity-30">
            [0.0, 0.0]
          </div>
          <div className="absolute -top-8 -right-4 text-mono text-xs text-contour opacity-30">
            [100.0, 0.0]
          </div>
          
          <h1 className="text-display text-8xl font-black text-topo-brown leading-none mb-8">
            Navigate Your<br />
            Fictional World
          </h1>
          
          <p className="text-mono text-lg max-w-2xl text-topo-brown mb-12 leading-relaxed">
            ORBIS is a comprehensive navigation system for imaginary worlds. 
            Design custom locations, build road networks, and calculate optimal 
            routes through your fantasy realms with precision cartographic tools.
          </p>

          <div className="flex gap-4">
            {isAuthenticated ? (
              <>
                <Link to="/map" className="btn btn-primary">
                  Open Map →
                </Link>
                <Link to="/places" className="btn btn-secondary">
                  Browse Locations
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-primary">
                  Get Started →
                </Link>
                <a href="#features" className="btn btn-secondary">
                  Learn More
                </a>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="mb-24">
        <h2 className="text-display text-5xl font-black text-topo-brown mb-12">
          Core Features
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FeatureCard
            number="01"
            title="Custom Locations"
            description="Create detailed locations with attributes like capacity, parking spaces, and accessibility. Define hotels, parks, cafes, landmarks, and more."
          />
          <FeatureCard
            number="02"
            title="Road Networks"
            description="Design interconnected paths between locations. Set distance, road types, and time-based restrictions for realistic navigation."
          />
          <FeatureCard
            number="03"
            title="Multi-Modal Transport"
            description="Choose between car, bicycle, bus, or walking. Each mode has unique speed multipliers, costs, and environmental impacts."
          />
          <FeatureCard
            number="04"
            title="Route Planning"
            description="Calculate optimal paths with real-time distance, time, and cost analysis. Add pit stops and save favorite routes."
          />
          <FeatureCard
            number="05"
            title="Landmark System"
            description="Mark special points of interest within locations. Categorize as mountains, rivers, lakes, or city landmarks."
          />
          <FeatureCard
            number="06"
            title="Multi-Currency"
            description="Define location-specific currencies with exchange rates. Calculate travel costs across different economic zones."
          />
        </div>
      </section>

      {/* Technical details */}
      <section className="card p-12 mb-24">
        <h2 className="text-display text-4xl font-black text-topo-brown mb-8">
          Technical Stack
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-mono text-xs uppercase tracking-widest font-bold mb-4 text-topo-green">
              Backend
            </h3>
            <ul className="text-mono text-sm space-y-2 text-topo-brown">
              <li>• Python + Flask</li>
              <li>• SQLAlchemy ORM</li>
              <li>• PostgreSQL Database</li>
              <li>• JWT Authentication</li>
              <li>• RESTful API</li>
            </ul>
          </div>

          <div>
            <h3 className="text-mono text-xs uppercase tracking-widest font-bold mb-4 text-topo-green">
              Frontend
            </h3>
            <ul className="text-mono text-sm space-y-2 text-topo-brown">
              <li>• React + TypeScript</li>
              <li>• Vite Build Tool</li>
              <li>• Leaflet Maps</li>
              <li>• Framer Motion</li>
              <li>• Tailwind CSS</li>
            </ul>
          </div>

          <div>
            <h3 className="text-mono text-xs uppercase tracking-widest font-bold mb-4 text-topo-green">
              Features
            </h3>
            <ul className="text-mono text-sm space-y-2 text-topo-brown">
              <li>• A* Pathfinding</li>
              <li>• Graph Visualization</li>
              <li>• User Accounts</li>
              <li>• Route Persistence</li>
              <li>• Real-time Updates</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      {!isAuthenticated && (
        <section className="text-center py-16 border-4 border-topo-brown bg-topo-green">
          <h2 className="text-display text-5xl font-black text-topo-cream mb-6">
            Start Building Your World
          </h2>
          <p className="text-mono text-topo-cream mb-8 opacity-90">
            Create an account and begin mapping your fictional realm
          </p>
          <Link to="/login" className="btn btn-accent">
            Create Account →
          </Link>
        </section>
      )}
    </div>
  )
}

// Feature card component
function FeatureCard({ 
  number, 
  title, 
  description 
}: { 
  number: string
  title: string
  description: string 
}) {
  return (
    <div className="card p-8 group hover:translate-x-2 hover:translate-y-2 transition-transform duration-150">
      <div className="flex items-start gap-4">
        <span className="text-display text-6xl font-black text-contour opacity-20 leading-none">
          {number}
        </span>
        <div>
          <h3 className="text-mono text-sm uppercase tracking-wider font-bold text-topo-brown mb-3">
            {title}
          </h3>
          <p className="text-mono text-sm text-topo-brown leading-relaxed opacity-80">
            {description}
          </p>
        </div>
      </div>
    </div>
  )
}
