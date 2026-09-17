// MOTORFX2 — modèle de données du manifeste d'export.
//
// Le manifeste déclare tout ce que le jeu doit savoir sans deviner : douze
// images par direction, douze expositions, les plages de rôles, les
// événements, les caps monde, les pivots et la métrique pixel/monde.
//
// Le choix de l'image se fait par **cumul des expositions**, jamais par une
// hypothèse de cadence fixe : c'est la règle du document directeur, et c'est
// aussi ce qui rend le mode expressif et le mode uniforme interchangeables.

using System;
using UnityEngine;

namespace MotorFx
{
    [Serializable]
    public class RecipeInfo
    {
        public string id;
        public string familyId;
        public string rank;
        public string name;
        public string element;
        public string action;
        public string builder;
        public int seed;
        public string style;
        public string silhouette;
    }

    [Serializable]
    public class AnimationInfo
    {
        public int frameCount;
        public int framesPerDirection;
        public int frameIndexBase;
        public int[] frameDurationsMs;
        public int totalDurationMs;
        public string endBehavior;
        /// <summary>Durée unique du mode uniforme, pour une cible à cadence fixe.</summary>
        public int uniformDurationMs;
    }

    [Serializable]
    public class ClipInfo
    {
        public string role;
        public int[] range;
        public string anchor;
        public string playback;
        public string trigger;

        public int First => range != null && range.Length > 0 ? range[0] : 0;
        public int Last => range != null && range.Length > 1 ? range[1] : 0;
        public int Length => Last - First + 1;
        public bool Loops => playback == "loop";
    }

    [Serializable]
    public class EventInfo
    {
        public string id;
        public int frame;
        public int timeMs;
    }

    [Serializable]
    public class ProjectionInfo
    {
        public string id;
        public float groundScale;
        public float groundRatio;
        public float heightScale;
        public float pixelsPerTile;
    }

    [Serializable]
    public class DirectionInfo
    {
        public int index;
        public float headingRad;
        public Vector2 vector;
        public float screenAngleRad;
        public string label;
    }

    [Serializable]
    public class CaptureInfo
    {
        public int width;
        public int height;
        public Vector2 pivot;
        public float distanceTiles;
        public float casterHeightTiles;
    }

    [Serializable]
    public class CellInfo
    {
        public int direction;
        public int frame;
        public int x;
        public int y;
        public int w;
        public int h;
        public int pivotX;
        public int pivotY;
        public int durationMs;
        public string role;
    }

    [Serializable]
    public class AtlasInfo
    {
        public int columns;
        public int rows;
        public int cellWidth;
        public int cellHeight;
        public int padding;
        public int extrude;
        public CellInfo[] cells;
    }

    [Serializable]
    public class PassInfo
    {
        public string name;
        public string file;
        public string blend;
        public string alpha;
        public int colors;
    }

    [Serializable]
    public class AssemblyInfo
    {
        public string mode;
        public string flyPlayback;
        public string note;
    }

    [Serializable]
    public class MotorFxManifest
    {
        public int manifestVersion;
        public string engineVersion;
        public int schemaVersion;
        public RecipeInfo recipe;
        public AnimationInfo animation;
        public ClipInfo[] clips;
        public EventInfo[] events;
        public ProjectionInfo projection;
        public DirectionInfo[] directions;
        public CaptureInfo capture;
        public AtlasInfo atlas;
        public PassInfo[] passes;
        public AssemblyInfo assembly;
        public string[] limits;

        public static MotorFxManifest Parse(string json)
        {
            var manifest = JsonUtility.FromJson<MotorFxManifest>(json);
            if (manifest == null) throw new ArgumentException("Manifeste MOTORFX2 illisible");
            if (manifest.animation == null || manifest.animation.frameDurationsMs == null
                || manifest.animation.frameDurationsMs.Length != manifest.animation.frameCount)
            {
                throw new ArgumentException(
                    "Manifeste MOTORFX2 : le nombre d'expositions ne correspond pas au nombre d'images");
            }
            foreach (var duration in manifest.animation.frameDurationsMs)
            {
                if (duration <= 0)
                {
                    throw new ArgumentException("Manifeste MOTORFX2 : une exposition doit être strictement positive");
                }
            }
            return manifest;
        }

        public ClipInfo Clip(string role)
        {
            if (clips == null) return null;
            foreach (var clip in clips)
            {
                if (clip.role == role) return clip;
            }
            return null;
        }

        public EventInfo Event(string id)
        {
            if (events == null) return null;
            foreach (var e in events)
            {
                if (e.id == id) return e;
            }
            return null;
        }

        /// <summary>Image affichée à un instant donné, par cumul des expositions.</summary>
        public int FrameAt(float seconds, int first, int last, bool loop)
        {
            var durations = animation.frameDurationsMs;
            var span = 0;
            for (var i = first; i <= last; i++) span += durations[i];
            if (span <= 0) return first;

            var ms = seconds * 1000f;
            if (loop) ms = Mathf.Repeat(ms, span);
            else if (ms >= span) return last;

            var acc = 0f;
            for (var i = first; i <= last; i++)
            {
                acc += durations[i];
                if (ms < acc) return i;
            }
            return last;
        }

        public float ClipSeconds(ClipInfo clip)
        {
            var total = 0;
            for (var i = clip.First; i <= clip.Last; i++) total += animation.frameDurationsMs[i];
            return total / 1000f;
        }

        /// <summary>
        /// Cap exporté le plus proche d'un cap libre, avec hystérésis : sans
        /// marge, un personnage qui pivote fait clignoter le sprite entre deux
        /// directions voisines.
        /// </summary>
        public int PickDirection(float headingRad, int current = -1, float hysteresisRad = 0f)
        {
            if (directions == null || directions.Length == 0) return 0;
            var best = 0;
            var bestDistance = float.MaxValue;
            for (var i = 0; i < directions.Length; i++)
            {
                var distance = Mathf.Abs(Mathf.DeltaAngle(
                    directions[i].headingRad * Mathf.Rad2Deg, headingRad * Mathf.Rad2Deg)) * Mathf.Deg2Rad;
                if (distance < bestDistance)
                {
                    bestDistance = distance;
                    best = i;
                }
            }
            if (current < 0 || current >= directions.Length || current == best) return best;
            var currentDistance = Mathf.Abs(Mathf.DeltaAngle(
                directions[current].headingRad * Mathf.Rad2Deg, headingRad * Mathf.Rad2Deg)) * Mathf.Deg2Rad;
            return currentDistance - bestDistance > hysteresisRad ? best : current;
        }

        /// <summary>Index de la cellule (direction, image) dans l'atlas linéaire.</summary>
        public int CellIndex(int direction, int frame)
        {
            return direction * animation.framesPerDirection + (frame - animation.frameIndexBase);
        }
    }
}
