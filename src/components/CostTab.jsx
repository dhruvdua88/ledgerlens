import React from 'react'
import { fmtINR, MODELS } from '../lib/pricing.js'

export default function CostTab({ log, rate, onClear }) {
  const total = log.reduce((s, e) => s + e.usd, 0)
  const tokens = log.reduce((s, e) => s + e.inTokens + e.outTokens, 0)
  const calls = log.length

  return (
    <div className="body">
      <div className="panel" style={{ maxWidth: 720 }}>
        <h3>API cost</h3>
        <p className="muted">What DeepSeek has charged this device, in INR at ₹{rate}/USD (set in Settings). Computed from the token usage each response reports, at current published prices.</p>

        <div className="metrics" style={{ marginBottom: 20 }}>
          <div className="metric"><div className="l">Total spend</div><div className="v">{fmtINR(total, rate)}</div></div>
          <div className="metric"><div className="l">Queries</div><div className="v">{calls}</div></div>
          <div className="metric"><div className="l">Tokens</div><div className="v">{tokens.toLocaleString('en-IN')}</div></div>
          <div className="metric"><div className="l">Avg / query</div><div className="v">{calls ? fmtINR(total / calls, rate) : '₹0'}</div></div>
        </div>

        {!log.length && <div className="empty">No queries yet.</div>}
        {!!log.length && (
          <div className="tablewrap">
            <table className="res">
              <thead><tr>
                <th>When</th><th>Question</th><th>Model</th>
                <th className="num">In tok</th><th className="num">Out tok</th><th className="num">Cost</th>
              </tr></thead>
              <tbody>
                {[...log].reverse().map((e, i) => (
                  <tr key={i}>
                    <td>{e.at}</td>
                    <td>{e.q.length > 46 ? e.q.slice(0, 46) + '…' : e.q}</td>
                    <td>{MODELS[e.model]?.label || e.model}</td>
                    <td className="num">{e.inTokens.toLocaleString('en-IN')}</td>
                    <td className="num">{e.outTokens.toLocaleString('en-IN')}</td>
                    <td className="num">{e.free ? 'local · ₹0' : fmtINR(e.usd, rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!!log.length && (
          <div className="actions"><button className="btn" onClick={onClear}>Clear log</button></div>
        )}
      </div>
    </div>
  )
}
