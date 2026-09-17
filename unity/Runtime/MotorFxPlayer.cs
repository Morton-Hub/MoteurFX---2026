// MOTORFX2 — lecteur d'un clip directionnel.
//
// Trois règles viennent du document directeur :
//  - l'image est choisie par cumul des douze expositions, pas par un FPS ;
//  - un changement de cap **conserve le temps** : le sort ne redémarre pas ;
//  - la dernière image est affichée pendant toute son exposition avant
//    l'effacement déclaré.

using System;
using UnityEngine;

namespace MotorFx
{
    [RequireComponent(typeof(SpriteRenderer))]
    public class MotorFxPlayer : MonoBehaviour
    {
        public MotorFxPack pack;

        [Tooltip("Rôle joué : cast, fly, hit, residue. Vide = les douze images.")]
        public string role = "";

        [Tooltip("Cap monde en degrés. Le lecteur choisit le cap exporté le plus proche.")]
        public float headingDegrees;

        [Tooltip("Marge, en degrés, avant de changer de cap. Évite le clignotement entre deux voisins.")]
        public float hysteresisDegrees = 8f;

        [Tooltip("Mode uniforme : douze images de durée égale, pour une cible à cadence fixe.")]
        public bool uniformTiming;

        [Tooltip("Renderer de la passe lumineuse. Facultatif.")]
        public SpriteRenderer emissionRenderer;

        public event Action<string> OnSpellEvent;
        public event Action OnFinished;

        private SpriteRenderer _renderer;
        private float _time;
        private int _direction;
        private int _lastFrame = -1;
        private bool _finished;
        private int _nextEvent;

        private void Awake()
        {
            _renderer = GetComponent<SpriteRenderer>();
        }

        private void OnEnable()
        {
            Rewind();
        }

        public void Rewind()
        {
            _time = 0f;
            _lastFrame = -1;
            _finished = false;
            _nextEvent = 0;
        }

        private void Update()
        {
            if (pack == null || pack.Manifest == null || _finished) return;
            var manifest = pack.Manifest;

            var clip = string.IsNullOrEmpty(role) ? null : manifest.Clip(role);
            var first = clip?.First ?? manifest.animation.frameIndexBase;
            var last = clip?.Last ?? manifest.animation.frameCount - 1;
            var loops = clip?.Loops ?? false;

            _time += Time.deltaTime;

            // Le cap peut changer en cours de route : on garde le temps écoulé.
            _direction = manifest.PickDirection(
                headingDegrees * Mathf.Deg2Rad, _direction, hysteresisDegrees * Mathf.Deg2Rad);

            var frame = uniformTiming
                ? UniformFrame(manifest, first, last, loops)
                : manifest.FrameAt(_time, first, last, loops);

            if (frame != _lastFrame)
            {
                _lastFrame = frame;
                _renderer.sprite = pack.Body(_direction, frame);
                if (emissionRenderer != null) emissionRenderer.sprite = pack.Emission(_direction, frame);
            }

            if (manifest.events != null)
            {
                while (_nextEvent < manifest.events.Length
                       && manifest.events[_nextEvent].timeMs <= _time * 1000f)
                {
                    OnSpellEvent?.Invoke(manifest.events[_nextEvent].id);
                    _nextEvent++;
                }
            }

            if (!loops && _time * 1000f >= SpanMs(manifest, first, last))
            {
                // L'effacement est déclaré à la fin de l'exposition, il n'est
                // pas obtenu en consommant une cellule transparente.
                _finished = true;
                if (manifest.animation.endBehavior == "clear")
                {
                    _renderer.sprite = null;
                    if (emissionRenderer != null) emissionRenderer.sprite = null;
                }
                OnFinished?.Invoke();
            }
        }

        private int UniformFrame(MotorFxManifest manifest, int first, int last, bool loops)
        {
            var count = last - first + 1;
            var each = manifest.animation.uniformDurationMs / 1000f;
            var index = Mathf.FloorToInt(_time / Mathf.Max(0.001f, each));
            if (loops) index %= count;
            return first + Mathf.Clamp(index, 0, count - 1);
        }

        private static int SpanMs(MotorFxManifest manifest, int first, int last)
        {
            var total = 0;
            for (var i = first; i <= last; i++) total += manifest.animation.frameDurationsMs[i];
            return total;
        }
    }
}
