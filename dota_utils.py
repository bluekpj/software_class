import os
import glob


def GetFileFromThisRootDir(dir, ext=None):
    allfiles = []
    need_ext_filter = (ext != None)
    for root, dirs, files in os.walk(dir):
        for filespath in files:
            filepath = os.path.join(root, filespath)
            extension = os.path.splitext(filepath)[1][1:]
            if need_ext_filter and extension in ext:
                allfiles.append(filepath)
            elif not need_ext_filter:
                allfiles.append(filepath)
    return allfiles


def custombasename(filename):
    filename = os.path.basename(filename)
    filename = os.path.splitext(filename)[0]
    return filename


def basename(filename):
    """Extract the base name of a file path.
    
    Args:
        filename (str): File path.
        
    Returns:
        str: Base name of the file without extension.
    """
    return os.path.splitext(os.path.basename(filename))[0]