// Full public cleaner profile modal with review history.
function CleanerProfileModal({ cleaner, onClose, onOffer }) {
  if (!cleaner) return null;
  const areas = cleaner.areas.join(" · ");
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Cleaner profile</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="profile-body">
          <div className="profile-hero">
            <Avatar name={cleaner.name} size={72} className="profile-avatar" />
            <div>
              <h3>
                {cleaner.name}
                {cleaner.kind === "agency" && <span className="cleaner-card-tag">Agency</span>}
              </h3>
              <RatingStars rating={cleaner.rating} count={cleaner.jobs} size={16} />
              {areas && <p className="profile-meta"><Icon name="map-pin" /> {cleaner.city} · {areas}</p>}
            </div>
          </div>

          {cleaner.bio && <p className="profile-bio">{cleaner.bio}</p>}

          <dl className="profile-facts">
            <div><dt>Experience</dt><dd>{cleaner.exp}</dd></div>
            <div><dt>Languages</dt><dd>{cleaner.languages}</dd></div>
            <div><dt>Transport</dt><dd>{cleaner.car ? <><Icon name="car" /> Own car</> : "Public transport"}</dd></div>
          </dl>

          <div className="profile-reviews">
            <h4>Reviews <span className="reviews-count">{cleaner.reviews.length}</span></h4>
            {cleaner.reviews.length === 0 ? (
              <p className="muted-note" style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="message-square" /> No reviews yet.</p>
            ) : (
              <ul className="review-list">
                {cleaner.reviews.map((r) => (
                  <li className="review-item" key={r.id}>
                    <div className="review-item-head">
                      <strong>{r.by}</strong>
                      <RatingStars rating={r.rating} size={13} showValue={false} />
                    </div>
                    <p>{r.text}</p>
                    <span className="review-item-date">{r.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onOffer}><Icon name="send" /> Offer a job</button>
        </div>
      </div>
    </div>
  );
}

window.CleanerProfileModal = CleanerProfileModal;
