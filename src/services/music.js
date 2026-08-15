const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const playdl = require('play-dl');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ── Playlists directory ──
const PLAYLISTS_DIR = path.join(__dirname, '../../data/playlists');
if (!fs.existsSync(PLAYLISTS_DIR)) fs.mkdirSync(PLAYLISTS_DIR, { recursive: true });

// ── Initialize play-dl with cookie (if set) ──
if (process.env.YOUTUBE_COOKIE) {
    try {
        playdl.setToken({
            youtube: {
                cookie: process.env.YOUTUBE_COOKIE,
            }
        });
    } catch (e) {
        console.error('[music] Failed to set cookie:', e);
    }
}

// ── In-memory state ──
const queues = new Map();

function getQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, {
            queue: [],
            current: null,
            player: null,
            connection: null,
            volume: 100,
            loopMode: 'off',
            twentyFourSeven: false
        });
    }
    return queues.get(guildId);
}

function clearQueue(guildId) {
    const q = getQueue(guildId);
    q.queue = [];
    q.current = null;
    if (q.player) {
        q.player.stop();
        q.player = null;
    }
    if (!q.twentyFourSeven && q.connection) {
        q.connection.destroy();
        q.connection = null;
    }
    queues.delete(guildId);
}

// ── Search using play-dl ──
async function search(query, limit = 5) {
    try {
        const results = await playdl.search(query, { limit, source: { youtube: 'video' } });
        return results.map(v => ({
            title: v.title,
            url: v.url,
            duration: v.durationRaw ? {
                seconds: v.durationInSec,
                timestamp: v.durationRaw,
            } : null,
            thumbnail: v.thumbnails[0]?.url || null,
            author: v.channel?.name || 'Unknown',
        }));
    } catch (e) {
        console.error('[search]', e);
        return [];
    }
}

// ── Check if a URL is a Spotify track ──
function isSpotifyTrack(url) {
    return /open\.spotify\.com\/track\//.test(url);
}

// ── Get song info and stream ──
async function getSongInfo(query, requestedBy) {
    let video;
    try {
        // If it's a YouTube URL
        if (playdl.yt_validate(query) === 'video') {
            video = await playdl.video_info(query);
        } else if (isSpotifyTrack(query)) {
            // Spotify track: use play-dl's spotify support
            try {
                const spotifyTrack = await playdl.spotify(query);
                if (!spotifyTrack) throw new Error('Spotify track not found');
                // Search YouTube for the track
                const searchQuery = `${spotifyTrack.name} ${spotifyTrack.artists[0].name}`;
                const results = await search(searchQuery, 1);
                if (!results.length) throw new Error('No YouTube result for Spotify track');
                const url = results[0].url;
                video = await playdl.video_info(url);
                // Override title/artist for better display
                video.video_details.title = `${spotifyTrack.name} - ${spotifyTrack.artists.map(a => a.name).join(', ')}`;
                video.video_details.channel = { name: 'Spotify' };
            } catch (spotifyErr) {
                // If spotify fails, fallback to searching YouTube with the original query
                console.error('[spotify] Error, falling back to search:', spotifyErr);
                const results = await search(query, 1);
                if (!results.length) throw new Error('No results found');
                const url = results[0].url;
                video = await playdl.video_info(url);
            }
        } else {
            // Regular search
            const results = await search(query, 1);
            if (!results.length) throw new Error('No results found');
            const url = results[0].url;
            video = await playdl.video_info(url);
        }
    } catch (err) {
        console.error('[getSongInfo]', err);
        throw new Error('Could not retrieve song info. Please try again.');
    }

    const song = {
        title: video.video_details.title,
        url: video.video_details.url,
        duration: video.video_details.durationInSec ? {
            seconds: video.video_details.durationInSec,
            timestamp: video.video_details.durationRaw || new Date(video.video_details.durationInSec * 1000).toISOString().substr(11, 8),
        } : null,
        thumbnail: video.video_details.thumbnails[0]?.url || null,
        requestedBy: requestedBy,
    };
    return { song, stream: video };
}

// ── Play next ──
async function playNext(guildId, textChannel) {
    const q = getQueue(guildId);
    if (q.queue.length === 0) {
        q.current = null;
        if (q.player) {
            q.player.stop();
            q.player = null;
        }
        if (!q.twentyFourSeven && q.connection) {
            q.connection.destroy();
            q.connection = null;
        }
        return;
    }

    let song;
    if (q.loopMode === 'track' && q.current) {
        song = q.current;
    } else {
        song = q.queue.shift();
        if (q.loopMode === 'queue') {
            q.queue.push(song);
        }
        q.current = song;
    }

    try {
        const stream = await playdl.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
        resource.volume.setVolumeLogarithmic(q.volume / 100);

        if (!q.player) {
            q.player = createAudioPlayer();
            q.connection.subscribe(q.player);
        }

        q.player.play(resource);

        q.player.once(AudioPlayerStatus.Idle, () => {
            playNext(guildId, textChannel);
        });

        if (textChannel) {
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle('🎵 Now Playing')
                .setDescription(`**${song.title}**`)
                .setURL(song.url)
                .setThumbnail(song.thumbnail)
                .addFields(
                    { name: 'Duration', value: song.duration?.timestamp || 'Live', inline: true },
                    { name: 'Requested by', value: `<@${song.requestedBy}>`, inline: true },
                    { name: 'Loop', value: q.loopMode === 'track' ? '🔂 Track' : q.loopMode === 'queue' ? '🔁 Queue' : 'Off', inline: true },
                )
                .setTimestamp();
            await textChannel.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (err) {
        console.error('[playNext]', err);
        if (textChannel) {
            await textChannel.send({ content: `❌ Failed to play **${song.title}**. Skipping.` }).catch(() => {});
        }
        playNext(guildId, textChannel);
    }
}

// ── Join voice with robust error handling ──
async function joinVoice(guildId, voiceChannel, textChannel) {
    const q = getQueue(guildId);
    if (q.connection && q.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        return q.connection;
    }

    // Check permissions
    const permissions = voiceChannel.permissionsFor(voiceChannel.guild.members.me);
    if (!permissions.has(PermissionsBitField.Flags.Connect)) {
        throw new Error('I do not have permission to connect to this voice channel.');
    }
    if (!permissions.has(PermissionsBitField.Flags.Speak)) {
        throw new Error('I do not have permission to speak in this voice channel.');
    }

    // Ensure the bot isn't already in a voice channel
    if (q.connection) {
        q.connection.destroy();
        q.connection = null;
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    q.connection = connection;

    // Wait for the connection to be ready (up to 60 seconds)
    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 60_000);
    } catch (err) {
        connection.destroy();
        q.connection = null;
        throw new Error(`Could not join voice channel: ${err.message}`);
    }

    // Handle disconnections
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch {
            clearQueue(guildId);
            if (textChannel) {
                await textChannel.send({ content: '❌ Disconnected from voice channel.' }).catch(() => {});
            }
        }
    });

    return connection;
}

// ── Play a song ──
async function play(guildId, query, requestedBy, textChannel) {
    const q = getQueue(guildId);
    const { song } = await getSongInfo(query, requestedBy);
    if (!song) throw new Error('Could not retrieve song');

    q.queue.push(song);

    if (!q.current && !q.player) {
        await playNext(guildId, textChannel);
        return song;
    }

    if (textChannel) {
        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('📥 Added to Queue')
            .setDescription(`**${song.title}**`)
            .setURL(song.url)
            .setThumbnail(song.thumbnail)
            .addFields(
                { name: 'Position', value: `${q.queue.length}`, inline: true },
                { name: 'Requested by', value: `<@${song.requestedBy}>`, inline: true },
            )
            .setTimestamp();
        await textChannel.send({ embeds: [embed] }).catch(() => {});
    }

    return song;
}

// ── Expose all needed functions ──
module.exports = {
    joinVoice,
    play,
    skip: (guildId) => { const q = getQueue(guildId); if (!q.player) return false; q.player.stop(); return true; },
    stop: (guildId) => { const q = getQueue(guildId); if (q.connection) q.connection.destroy(); clearQueue(guildId); queues.delete(guildId); return true; },
    pause: (guildId) => { const q = getQueue(guildId); if (!q.player) return false; q.player.pause(); return true; },
    resume: (guildId) => { const q = getQueue(guildId); if (!q.player) return false; q.player.unpause(); return true; },
    setVolume,
    setLoop,
    shuffle,
    removeFromQueue,
    moveInQueue,
    clear,
    getQueueInfo,
    set247,
    search,
    savePlaylist,
    loadPlaylist,
    listPlaylists,
    deletePlaylist,
    getQueue,
    playNext,
};

// ── Helper functions ──
function setVolume(guildId, volume) {
    const q = getQueue(guildId);
    if (volume < 1 || volume > 200) return false;
    q.volume = volume;
    return true;
}

function setLoop(guildId, mode) {
    const q = getQueue(guildId);
    if (!['off', 'track', 'queue'].includes(mode)) return false;
    q.loopMode = mode;
    return true;
}

function shuffle(guildId) {
    const q = getQueue(guildId);
    if (q.queue.length < 2) return false;
    for (let i = q.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q.queue[i], q.queue[j]] = [q.queue[j], q.queue[i]];
    }
    return true;
}

function removeFromQueue(guildId, index) {
    const q = getQueue(guildId);
    if (index < 1 || index > q.queue.length) return null;
    const removed = q.queue.splice(index - 1, 1);
    return removed[0];
}

function moveInQueue(guildId, from, to) {
    const q = getQueue(guildId);
    if (from < 1 || from > q.queue.length || to < 1 || to > q.queue.length) return false;
    const [item] = q.queue.splice(from - 1, 1);
    q.queue.splice(to - 1, 0, item);
    return true;
}

function clear(guildId) {
    const q = getQueue(guildId);
    q.queue = [];
    return true;
}

function getQueueInfo(guildId) {
    const q = getQueue(guildId);
    return {
        current: q.current,
        queue: q.queue,
        length: q.queue.length,
        playing: !!q.current,
        loopMode: q.loopMode,
        volume: q.volume,
        twentyFourSeven: q.twentyFourSeven,
    };
}

function set247(guildId, enabled) {
    const q = getQueue(guildId);
    q.twentyFourSeven = enabled;
    return true;
}

function savePlaylist(userId, name, songs) {
    const filePath = path.join(PLAYLISTS_DIR, `${userId}.json`);
    let data = {};
    if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    data[name] = songs;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
}

function loadPlaylist(userId, name) {
    const filePath = path.join(PLAYLISTS_DIR, `${userId}.json`);
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data[name] || null;
}

function listPlaylists(userId) {
    const filePath = path.join(PLAYLISTS_DIR, `${userId}.json`);
    if (!fs.existsSync(filePath)) return [];
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Object.keys(data);
}

function deletePlaylist(userId, name) {
    const filePath = path.join(PLAYLISTS_DIR, `${userId}.json`);
    if (!fs.existsSync(filePath)) return false;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data[name]) return false;
    delete data[name];
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
}