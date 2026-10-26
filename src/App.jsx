import { useState } from 'react'
import './App.css'

import FinalGroupTicketList from './features/final-group-ticket-list/FinalGroupTicketList'
import LogoTool from './features/logo-tool/LogoTool'
import QualityCheck from './features/quality-check/QualityCheck'
import TestCanPage from './features/test-can/TestCanPage'
import ProblemReporter from './features/problem-report/ProblemReporter'

const workflows = [
  {
    id: 'final-group-ticket-list',
    label: 'Pack the Tin',
    title: 'Build FMG Manifest',
  },
  {
    id: 'logo-tool',
    label: 'Relabel the Tin',
  },
  {
    id: 'seating',
    label: 'Quality Check',
    title: 'Seating',
  },
]

function SardineFactory() {
  return (
    <div
      className="sardine-factory"
      aria-hidden="true"
    >
      {/* Fish waiting to be professionally packaged */}
      <div className="factory-fish-lane">
        <div className="factory-fish factory-fish-one">
          <span className="factory-fish-tail" />
          <span className="factory-fish-body">
            <span className="factory-fish-eye" />
          </span>
        </div>

        <div className="factory-fish factory-fish-two">
          <span className="factory-fish-tail" />
          <span className="factory-fish-body">
            <span className="factory-fish-eye" />
          </span>
        </div>

        <div className="factory-fish factory-fish-three">
          <span className="factory-fish-tail" />
          <span className="factory-fish-body">
            <span className="factory-fish-eye" />
          </span>
        </div>
      </div>

      {/* Extremely legitimate passenger packing machinery */}
      <div className="factory-machine">
        <div className="factory-machine-top">
          <span className="factory-machine-light" />
          <span className="factory-machine-light" />
          <span className="factory-machine-light" />
        </div>

        <div className="factory-machine-body">
          <div className="factory-intake">
            <span />
          </div>

          <div className="factory-machine-panel">
            <span className="factory-gauge">
              <span className="factory-gauge-needle" />
            </span>

            <span className="factory-button" />
          </div>

          <div className="factory-machine-feet">
            <span />
            <span />
          </div>
        </div>
      </div>

      {/* Conveyor */}
      <div className="factory-conveyor">
        <div className="factory-conveyor-belt">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="factory-conveyor-leg factory-conveyor-leg-one" />
        <div className="factory-conveyor-leg factory-conveyor-leg-two" />
      </div>

      {/* Finished tins */}
      <div className="factory-tin factory-tin-one">
        <span className="factory-tin-band" />
        <span className="factory-tin-fish" />
      </div>

      <div className="factory-tin factory-tin-two">
        <span className="factory-tin-band" />
        <span className="factory-tin-fish" />
      </div>

      {/* Crate where properly packed passengers belong */}
      <div className="factory-crate">
        <div className="factory-crate-tins">
          <span />
          <span />
          <span />
        </div>

        <div className="factory-crate-front">
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}

function App() {
  const [
    activeWorkflow,
    setActiveWorkflow,
  ] = useState(
    'final-group-ticket-list'
  )

  if (window.location.pathname.replace(/\/+$/, '').endsWith('/test')) {
    return <><ProblemReporter screen="Test Can" /><TestCanPage /></>
  }

  const activeIndex =
    workflows.findIndex(
      (workflow) =>
        workflow.id ===
        activeWorkflow
    )

  return (
    <main className="sardines">
      <header className="sardines-header">
        <p className="eyebrow">
          Lost Charter Studio presents
        </p>

        <h1>
          Sardines
        </h1>

        <p className="tagline">
          Passenger Packing Protocol.
        </p>
      </header>

      <SardineFactory />

      <ProblemReporter screen={workflows.find((workflow) => workflow.id === activeWorkflow)?.label || 'General'} />

      <section className="workspace">
        <div
          className="workflow-toggle"
          role="group"
          aria-label="Sardines workflow"
          style={{
            '--workflow-index':
              activeIndex,
            '--workflow-count':
              workflows.length,
          }}
        >
          <div
            className="workflow-toggle-slider"
            aria-hidden="true"
          />

          {workflows.map(
            (workflow) => {
              const active =
                activeWorkflow ===
                workflow.id

              return (
                <button
                  key={
                    workflow.id
                  }
                  type="button"
                  title={
                    workflow.title
                  }
                  className={
                    active
                      ? 'workflow-toggle-option active'
                      : 'workflow-toggle-option'
                  }
                  aria-pressed={
                    active
                  }
                  onClick={() =>
                    setActiveWorkflow(
                      workflow.id
                    )
                  }
                >
                  <span>
                    {
                      workflow.label
                    }
                  </span>

                </button>
              )
            }
          )}
        </div>

        {activeWorkflow ===
          'final-group-ticket-list' && (
            <FinalGroupTicketList />
          )}

        {activeWorkflow ===
          'logo-tool' && (
            <LogoTool />
          )}

        {activeWorkflow ===
          'seating' && (
            <QualityCheck />
          )}

      </section>

      <footer>
        No sardines were harmed in the
        reconciliation of these travelers.
      </footer>
    </main>
  )
}

export default App
