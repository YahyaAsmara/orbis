import React from 'react'
import { useParams } from 'react-router-dom'

export default function PlaceDetail() {
  const { id } = useParams()
  return (
    <section>
      <h2 className="text-2xl font-bold">Place {id}</h2>
      <p className="mt-4">Detail view placeholder for place {id}.</p>
    </section>
  )
}
