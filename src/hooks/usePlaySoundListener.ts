import {useSelector} from "react-redux";
import {useEffect, useState} from "react";
import {SoundSchema} from "../modules/api";
import {initAudioPlayer, setGlobalVolume, subscribeIsPlaying} from "../modules/audioPlayer";

interface Props {
    sound: SoundSchema;
}

const usePlaySoundListener = ({sound}: Props) => {
    const volume = useSelector((state: any) => state.settings?.volume);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        initAudioPlayer();
    }, []);

    useEffect(() => {
        setGlobalVolume((volume ?? 100) / 100);
    }, [volume]);

    useEffect(() => {
        return subscribeIsPlaying(sound._id, setIsPlaying);
    }, [sound._id]);

    return {isPlaying};
};

export default usePlaySoundListener;
