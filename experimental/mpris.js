const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;


const mainloop = new GLib.MainLoop(null, false);
const connection = Gio.bus_get_sync(Gio.BusType.SESSION, null);
let mediaPlayers = {};
let mediaPlayersId;

/**
 * Initialization.
 */
function enable() {
    let names = queryMediaPlayerNames();
    let sinkInputs = queryPactlSinkInputs();
    names.forEach(name => {
        print('Media Player found:', name);
        let pid = queryProcessId(name);
        let status = queryPlaybackStatus(name);
        let statusId = monitorPlaybackStatus(name);
        let metadata = queryMetadata(name);
        let pactl = filterPactlSinkInputsByProcessId(sinkInputs, pid) ?? {};
        mediaPlayers[name] = {
            pid, status, statusId, metadata, pactl,
        };
    });
    print('=== Media Players ===');
    print(JSON.stringify(mediaPlayers, null, 2));
    print('=====================');

    mediaPlayersId = monitorMediaPlayers();
}

/**
 * Clean up.
 */
function disable() {
    connection.signal_unsubscribe(mediaPlayersId);
    mediaPlayers = {};
}

/**
 * Monitor media players.
 */
function monitorMediaPlayers() {
    return connection.signal_subscribe(
        'org.freedesktop.DBus', // Sender
        'org.freedesktop.DBus', // Interface
        'NameOwnerChanged',     // Member
        '/org/freedesktop/DBus', // Path
        null,                   // Arg0
        Gio.DBusSignalFlags.NONE,
        (_connection, _senderName, _objectPath, _interfaceName, _signalName, parameters, _userData) => {
            let [name, oldOwner, newOwner] = parameters.deep_unpack();
            if (name.startsWith('org.mpris.MediaPlayer2.')) {
                if (oldOwner === '') {
                    print('Media Player created:', name);
                    let pid = queryProcessId(name);
                    let status = queryPlaybackStatus(name);
                    let statusId = monitorPlaybackStatus(name);
                    let metadata = queryMetadata(name);
                    let sinkInputs = queryPactlSinkInputs();
                    let pactl = filterPactlSinkInputsByProcessId(sinkInputs, pid) ?? {};
                    mediaPlayers[name] = {
                        pid, status, statusId, metadata, pactl,
                    };
                } else if (newOwner === '') {
                    print('Media Player destroyed:', name);
                    connection.signal_unsubscribe(mediaPlayers[name].statusId);
                    delete mediaPlayers[name];
                }
                print('=== Media Players ===');
                print(JSON.stringify(mediaPlayers, null, 2));
                print('=====================');
            }
        }
    );
}

/**
 * Query the names of media players.
 */
function queryMediaPlayerNames() {
    let proxy = Gio.DBusProxy.new_sync(
        connection,              // connection
        Gio.DBusProxyFlags.NONE, // flags
        null,                    // info
        'org.freedesktop.DBus',  // name
        '/org/freedesktop/DBus', // object_path
        'org.freedesktop.DBus', // interface_name
        null                    // cancellable
    );

    try {
        let ret = proxy.call_sync(
            'ListNames',
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
        let [names] =  ret.deep_unpack();
        return names.filter(name => name.startsWith('org.mpris.MediaPlayer2.'));
    } catch (e) {
        print('Error:', e.message);
    }
    return null;
}


/**
 * Query the process id of the media player.
 *
 * @param mediaPlayerName org.mpris.MediaPlayer2.*
 */
function queryProcessId(mediaPlayerName) {
    let proxy = Gio.DBusProxy.new_sync(
        connection,
        Gio.DBusProxyFlags.NONE,
        null,
        'org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        'org.freedesktop.DBus',
        null
    );

    try {
        let ret = proxy.call_sync(
            'GetConnectionUnixProcessID',
            new GLib.Variant('(s)', [mediaPlayerName]),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
        let [pid] =  ret.deep_unpack();
        return pid;
    } catch (e) {
        print('Error:', e.message);
    }
    return null;
}

/**
 * Query the metadata of the media player.
 *
 * @param mediaPlayerName org.mpris.MediaPlayer2.*
 */
function queryMetadata(mediaPlayerName) {
    let proxy = Gio.DBusProxy.new_sync(
        connection,
        Gio.DBusProxyFlags.NONE,
        null,
        mediaPlayerName,
        '/org/mpris/MediaPlayer2',
        'org.freedesktop.DBus.Properties',
        null
    );

    try {
        let ret = proxy.call_sync(
            'Get',
            new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'Metadata']),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
        let [metadata] =  ret.recursiveUnpack();
        return metadata;
    } catch (e) {
        print('Error:', e.message);
    }
    return null;
}

/**
 * Query the playback status of the media player.
 *
 * @param mediaPlayerName org.mpris.MediaPlayer2.*
 */
function queryPlaybackStatus(mediaPlayerName) {
    let proxy = Gio.DBusProxy.new_sync(
        connection,
        Gio.DBusProxyFlags.NONE,
        null,
        mediaPlayerName,
        '/org/mpris/MediaPlayer2',
        'org.freedesktop.DBus.Properties',
        null
    );

    try {
        let ret = proxy.call_sync(
            'Get',
            new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'PlaybackStatus']),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
        let [status] =  ret.recursiveUnpack();
        return status;
    } catch (e) {
        print('Error:', e.message);
    }
    return null;
}

/**
 * Monitor the playback status of the media player.
 *
 * @param mediaPlayerName org.mpris.MediaPlayer2.*
 */
function monitorPlaybackStatus(mediaPlayerName) {
    // let proxy = Gio.DBusProxy.new_sync(
    //     connection,
    //     Gio.DBusProxyFlags.NONE,
    //     null,
    //     mediaPlayerName,
    //     '/org/mpris/MediaPlayer2',
    //     'org.mpris.MediaPlayer2.Player',
    //     null
    // );

    // proxy.connect(
    //     'g-properties-changed',
    //     (_proxy, properties) => {
    //         let changedProps = properties.deep_unpack();
    //         if (!changedProps.hasOwnProperty('PlaybackStatus'))
    //             return;
    //         print(changedProps.PlaybackStatus.deep_unpack());
    //     }
    // );

    // Another method
    return connection.signal_subscribe(
        mediaPlayerName, // Sender
        'org.freedesktop.DBus.Properties', // Interface
        'PropertiesChanged',     // Member
        '/org/mpris/MediaPlayer2', // Path
        null,                   // Arg0
        Gio.DBusSignalFlags.NONE,
        (_connection, _senderName, _objectPath, _interfaceName, _signalName, parameters, _userData) => {
            let [iface_, changedProps, invalidatedProps_] = parameters.deep_unpack();
            if (!changedProps.hasOwnProperty('PlaybackStatus'))
                return;
            let status = queryPlaybackStatus(mediaPlayerName);
            // For some reason, this doesn't work
            // let status = changedProps.PlaybackStatus.deep_unpack();
            mediaPlayers[mediaPlayerName].status = status;
            print('=== Media Players ===');
            print(JSON.stringify(mediaPlayers, null, 2));
            print('=====================');
        }
    );
}

/**
 *
 */
function queryPactlSinkInputs() {
    try {
        // Execute the command
        let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
        let proc = Gio.Subprocess.new(['pactl', '-f', 'json', 'list', 'sink-inputs'], flags);
        let [success, stdout, stderr_] = proc.communicate_utf8(null, null);

        if (!success)
            return null;

        let sinkInputs = [];
        let data = JSON.parse(stdout);

        // print(JSON.stringify(data, null, 2));

        data.forEach(item => {
            let sinkInput = {
                index: item.index ?? null,
                mute: item.mute ?? null,
                corked: item.corked ?? null,
                volume: getVolume(item.volume),
                appName: item.properties['application.name'] ?? null,
                processId: parseInt(item.properties['application.process.id']) ?? null,
                processName: item.properties['application.process.binary'] ?? null,
            };
            sinkInputs.push(sinkInput);
        });

        // Print the parsed data
        sinkInputs.forEach(sinkInput => {
            print('Index:', sinkInput.index);
            print('Mute:', sinkInput.mute);
            print('Corked:', sinkInput.corked);
            print('Volume:', sinkInput.volume);
            print('Application Name:', sinkInput.appName);
            print('Process ID:', sinkInput.processId);
            print('Process Name:', sinkInput.processName);
            print('-------------------------------');
        });

        return sinkInputs;
    } catch (e) {
        log('Error:', e.message);
    }
    return null;
}

/**
 *
 * @param sinkInputs
 * @param processId
 */
function filterPactlSinkInputsByProcessId(sinkInputs, processId) {
    if (sinkInputs === null || processId === null)
        return null;
    let pactl = sinkInputs.find(sinkInput => sinkInput.processId === processId);
    if (!pactl)
        return null;
    return {
        mute: pactl.mute,
        corked: pactl.corked,
        volume: pactl.volume,
        appName: pactl.appName,
        processName: pactl.processName,
    };
}
/**
 *
 * @param volumeObj
 */
function getVolume(volumeObj) {
    let volumePercent = null;
    if (Object.keys(volumeObj).length > 0)
        volumePercent = volumeObj[Object.keys(volumeObj)[0]]?.value_percent ?? null;
    return volumePercent;
}


enable();
mainloop.run();

disable();
